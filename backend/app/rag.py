"""App-owned LightRAG adapter (write side). Agents/routers call this, never LightRAG directly.

LightRAG v1.5.3 REST (spike ScrumAgent-m3c): insert via POST /documents/texts; the only
provenance channel is `file_source` (no metadata dict, no caller doc id, no upsert).
Workspace is instance-level. We tag every doc `file_source=f"{project_id}::{kind}::{id}"`
so we can delete/scope/count per project.
"""
from __future__ import annotations

import asyncio
import math
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass, field

import httpx

from app.config import Settings

_PAGE_SIZE = 200
_DELETE_BATCH = 100
# DELETE /documents/delete_document returns 200 with one of these status values.
_DELETE_ACCEPTED = {None, "deletion_started"}
_DELETE_BUSY = "busy"


class RagError(RuntimeError):
    """LightRAG adapter failure (transport error or non-2xx response)."""


@dataclass
class RagDocument:
    text: str
    source_kind: str
    source_id: str
    title: str
    source_uri: str


@dataclass
class IndexResult:
    submitted: int
    track_id: str | None = None
    failed: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class RagStatus:
    total: int
    by_status: dict[str, int]
    by_source_kind: dict[str, int] = field(default_factory=dict)


def _file_source(project_id: str, doc: RagDocument) -> str:
    return f"{project_id}::{doc.source_kind}::{doc.source_id}"


class RagClient:
    def __init__(
        self,
        base_url: str,
        *,
        api_key: str | None = None,
        timeout: float = 10.0,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
        poll_interval: float = 1.0,
        max_wait: float = 120.0,
        busy_retries: int = 5,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._api_key = api_key
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=timeout)
        )
        self._poll_interval = poll_interval
        self._max_wait = max_wait
        self._busy_retries = busy_retries
        self._sleep = sleep or asyncio.sleep

    @classmethod
    def from_settings(cls, settings: Settings) -> "RagClient":
        return cls(
            settings.lightrag_base_url,
            api_key=settings.lightrag_api_key,
            timeout=settings.lightrag_timeout_seconds,
            poll_interval=settings.rag_pipeline_poll_seconds,
            max_wait=settings.rag_pipeline_max_wait_seconds,
            busy_retries=settings.rag_pipeline_busy_retries,
        )

    def _params(self) -> dict:
        return {"api_key_header_value": self._api_key} if self._api_key else {}

    async def _pipeline_busy(self, client: httpx.AsyncClient) -> bool:
        """True while LightRAG's single-flight pipeline is running.

        `busy` is set/cleared together with `destructive_busy` (v1.5.3
        `_acquire/_release_destructive_busy`), so `busy=False` means a prior
        clear has fully drained and a following insert won't hit 409.
        """
        resp = await client.get(
            f"{self._base}/documents/pipeline_status", params=self._params()
        )
        resp.raise_for_status()
        return bool(resp.json().get("busy"))

    def _idle_attempts(self) -> int:
        if self._poll_interval <= 0:
            return 1
        return max(1, math.ceil(self._max_wait / self._poll_interval))

    async def _wait_for_idle(self, client: httpx.AsyncClient) -> None:
        """Block until the pipeline is idle; raise on a bounded timeout."""
        for _ in range(self._idle_attempts()):
            if not await self._pipeline_busy(client):
                return
            await self._sleep(self._poll_interval)
        raise RagError(
            f"LightRAG pipeline still busy after {self._max_wait:g}s"
        )

    async def index_documents(
        self, project_id: str, documents: Sequence[RagDocument]
    ) -> IndexResult:
        docs = list(documents)
        if not docs:
            return IndexResult(submitted=0)
        texts = [f"{d.title}\n{d.source_uri}\n\n{d.text}" for d in docs]
        file_sources = [_file_source(project_id, d) for d in docs]
        try:
            async with self._client_factory() as client:
                # Wait out any in-flight clear/scan, then insert. The insert
                # endpoint returns 409 while the pipeline is destructive-busy or
                # scanning, so retry after re-confirming idle (ScrumAgent-srp).
                for _ in range(self._busy_retries + 1):
                    await self._wait_for_idle(client)
                    resp = await client.post(
                        f"{self._base}/documents/texts",
                        params=self._params(),
                        json={"texts": texts, "file_sources": file_sources},
                    )
                    if resp.status_code == httpx.codes.CONFLICT:
                        continue
                    resp.raise_for_status()
                    track_id = resp.json().get("track_id")
                    return IndexResult(submitted=len(docs), track_id=track_id)
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"index failed: {exc}") from exc
        raise RagError("index failed: pipeline busy (409) after retries")

    async def _iter_project_docs(
        self, client: httpx.AsyncClient, project_id: str
    ) -> AsyncIterator[dict]:
        prefix = f"{project_id}::"
        page = 1
        while True:
            resp = await client.post(
                f"{self._base}/documents/paginated",
                params=self._params(),
                json={"page": page, "page_size": _PAGE_SIZE},
            )
            resp.raise_for_status()
            body = resp.json()
            docs = body.get("documents", []) or []
            for doc in docs:
                if str(doc.get("file_path", "")).startswith(prefix):
                    yield doc
            pagination = body.get("pagination", {}) or {}
            total_pages = pagination.get("total_pages")
            if total_pages is not None:
                if page >= total_pages:
                    return
            elif len(docs) < _PAGE_SIZE:
                return
            page += 1

    async def _delete_batch(
        self, client: httpx.AsyncClient, doc_ids: list[str]
    ) -> None:
        """Delete one batch, waiting out the single-flight destructive lock.

        delete_document returns HTTP 200 even when it scheduled nothing:
        status="busy" means the pipeline was occupied, so we wait for idle and
        retry rather than silently dropping the batch (the partial-delete bug).
        """
        for _ in range(self._busy_retries + 1):
            await self._wait_for_idle(client)
            resp = await client.request(
                "DELETE",
                f"{self._base}/documents/delete_document",
                params=self._params(),
                json={"doc_ids": doc_ids},
            )
            resp.raise_for_status()
            status = resp.json().get("status")
            if status in _DELETE_ACCEPTED:
                return
            if status == _DELETE_BUSY:
                continue
            raise RagError(f"delete_document returned status={status!r}")
        raise RagError("delete_document stayed busy after retries")

    async def clear_project(self, project_id: str) -> int:
        ids: list[str] = []
        try:
            async with self._client_factory() as client:
                async for doc in self._iter_project_docs(client, project_id):
                    doc_id = doc.get("id")
                    if doc_id:
                        ids.append(doc_id)
                for start in range(0, len(ids), _DELETE_BATCH):
                    await self._delete_batch(client, ids[start : start + _DELETE_BATCH])
                # Deletes drain asynchronously; wait so a following insert (and
                # this method's postcondition) sees a cleared, idle pipeline.
                await self._wait_for_idle(client)
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"clear failed: {exc}") from exc
        return len(ids)

    async def status(self, project_id: str) -> RagStatus:
        by_status: dict[str, int] = {}
        by_source_kind: dict[str, int] = {}
        total = 0
        try:
            async with self._client_factory() as client:
                async for doc in self._iter_project_docs(client, project_id):
                    total += 1
                    key = str(doc.get("status", "unknown"))
                    by_status[key] = by_status.get(key, 0) + 1
                    # file_path is "{project_id}::{source_kind}::{source_id}".
                    parts = str(doc.get("file_path", "")).split("::")
                    if len(parts) >= 2:
                        by_source_kind[parts[1]] = by_source_kind.get(parts[1], 0) + 1
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"status failed: {exc}") from exc
        return RagStatus(
            total=total, by_status=by_status, by_source_kind=by_source_kind
        )
