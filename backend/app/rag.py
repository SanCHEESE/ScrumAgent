"""App-owned LightRAG adapter (write side). Agents/routers call this, never LightRAG directly.

LightRAG v1.5.3 REST (spike ScrumAgent-m3c): insert via POST /documents/texts; the only
provenance channel is `file_source` (no metadata dict, no caller doc id, no upsert).
Workspace is instance-level. We tag every doc `file_source=f"{project_id}::{kind}::{id}"`
so we can delete/scope/count per project.
"""
from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Sequence
from dataclasses import dataclass, field

import httpx

from app.config import Settings

_PAGE_SIZE = 200


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
    ) -> None:
        self._base = base_url.rstrip("/")
        self._api_key = api_key
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=timeout)
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> "RagClient":
        return cls(
            settings.lightrag_base_url,
            api_key=settings.lightrag_api_key,
            timeout=settings.lightrag_timeout_seconds,
        )

    def _params(self) -> dict:
        return {"api_key_header_value": self._api_key} if self._api_key else {}

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
                resp = await client.post(
                    f"{self._base}/documents/texts",
                    params=self._params(),
                    json={"texts": texts, "file_sources": file_sources},
                )
                resp.raise_for_status()
                track_id = resp.json().get("track_id")
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"index failed: {exc}") from exc
        return IndexResult(submitted=len(docs), track_id=track_id)

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

    async def clear_project(self, project_id: str) -> int:
        ids: list[str] = []
        try:
            async with self._client_factory() as client:
                async for doc in self._iter_project_docs(client, project_id):
                    doc_id = doc.get("id")
                    if doc_id:
                        ids.append(doc_id)
                for start in range(0, len(ids), 100):
                    resp = await client.request(
                        "DELETE",
                        f"{self._base}/documents/delete_document",
                        params=self._params(),
                        json={"doc_ids": ids[start : start + 100]},
                    )
                    resp.raise_for_status()
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"clear failed: {exc}") from exc
        return len(ids)

    async def status(self, project_id: str) -> RagStatus:
        by_status: dict[str, int] = {}
        total = 0
        try:
            async with self._client_factory() as client:
                async for doc in self._iter_project_docs(client, project_id):
                    total += 1
                    key = str(doc.get("status", "unknown"))
                    by_status[key] = by_status.get(key, 0) + 1
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"status failed: {exc}") from exc
        return RagStatus(total=total, by_status=by_status)
