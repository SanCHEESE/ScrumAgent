# Jira/Notion Backlog Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a project is created with a Jira and/or Notion integration, pull its existing text backlog and index it into LightRAG as a durable background job, with a manual idempotent re-sync.

**Architecture:** Read-only Jira/Notion REST clients normalize issues/pages into a shared `SourceDocument`. An app-owned `RagClient` (`app/rag.py`) maps those to LightRAG `POST /documents/texts` with a `project_id::kind::id` `file_source` tag (LightRAG v1.5.3 has no metadata/upsert/per-request workspace — see spec). A persisted `IngestionRun` row plus an in-process asyncio worker (`app/ingestion.py`) orchestrate fetch→index with per-source error isolation. `POST /projects` enqueues a run via an injectable runner; `GET/POST .../knowledge-base/...` expose status and re-sync.

**Tech Stack:** Python 3, FastAPI, SQLAlchemy 2.0 (sync), httpx (`AsyncClient` + `MockTransport` in tests), pytest. Backend lives in `backend/`; run tests with `cd backend && .venv/bin/pytest -q`.

**Spec:** `docs/superpowers/specs/2026-06-17-jira-notion-backlog-ingestion-design.md`
**Beads:** epic `ScrumAgent-lcw`; tasks `daa` (Task 1), `chx` (Task 2), `an7` (Task 3), `ce5` (Task 4), `6v5` (Task 5). Spike `m3c` is done.

**Conventions to mirror (verified in repo):**
- HTTP clients take an optional `client_factory` defaulting to `lambda: httpx.AsyncClient(timeout=...)`, used as `async with self._client_factory() as client:` (see `app/integrations.py`, `app/google_calendar.py`).
- Tests inject `httpx.MockTransport` via `client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))` and run async code with `asyncio.run(...)`.
- Models: `from app.database import Base`; mixins `UUIDPKMixin`, `TimestampMixin`; `SAEnum(<Enum>, native_enum=False)`; `JSONType` from `app/models/types.py`. Register new models by importing them in `app/models/__init__.py`. Tables are created by `init_db()` (no Alembic).
- Settings: add fields to `Settings` in `app/config.py`; access via `Depends(get_settings)` or `Settings.from_*`.
- Router test harness (`backend/tests/test_project_integrations.py`): `_settings()`, `client` fixture overriding `deps.get_settings/get_db/get_integration_validators/get_google_calendar`, `_auth(uid)`, `_make_user(db)`, `_make_project(db, owner, *, with_jira, with_notion)`.

---

## Task 1: RAG adapter (`app/rag.py`) — `ScrumAgent-daa`

**Files:**
- Create: `backend/app/rag.py`
- Create: `backend/app/sources.py`
- Test: `backend/tests/test_rag_adapter.py`

`app/sources.py` is the shared, dependency-free output type for readers and the adapter input mapping.

- [ ] **Step 1: Create the shared `SourceDocument` type**

Create `backend/app/sources.py`:

```python
"""Normalized read-only source artifact shared by integration readers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class SourceDocument:
    source_kind: str        # "jira" | "notion"
    source_id: str          # "PROJ-123" | "<notion_page_id>"
    title: str
    text: str               # flattened plain text
    source_uri: str         # deep link back to the issue/page
    updated_at: datetime | None = None


def parse_iso_dt(value: str | None) -> datetime | None:
    """Best-effort ISO-8601 parse (accepts trailing 'Z'); None on failure."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
```

- [ ] **Step 2: Write the failing adapter test for `index_documents`**

Create `backend/tests/test_rag_adapter.py`:

```python
from __future__ import annotations

import asyncio

import httpx

from app.rag import IndexResult, RagClient, RagDocument, RagError, RagStatus


def _client(handler, *, api_key=None) -> RagClient:
    return RagClient(
        "http://lightrag:9621",
        api_key=api_key,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


def test_index_documents_posts_texts_with_file_source_tags():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/documents/texts"
        seen["body"] = httpx.Request("POST", request.url, content=request.content).read()
        import json

        seen["json"] = json.loads(seen["body"])
        return httpx.Response(200, json={"status": "ok", "message": "queued", "track_id": "trk-1"})

    docs = [
        RagDocument(
            text="Cannot log in on mobile.",
            source_kind="jira",
            source_id="PLAT-12",
            title="Login fails",
            source_uri="https://m.atlassian.net/browse/PLAT-12",
        )
    ]
    result = asyncio.run(_client(handler).index_documents("proj-1", docs))

    assert isinstance(result, IndexResult)
    assert result.submitted == 1
    assert result.track_id == "trk-1"
    assert seen["json"]["file_sources"] == ["proj-1::jira::PLAT-12"]
    # title + uri are prepended into the indexed text body
    assert seen["json"]["texts"][0].startswith("Login fails\nhttps://m.atlassian.net/browse/PLAT-12\n\n")


def test_index_documents_applies_api_key_query_param():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["api_key"] = request.url.params.get("api_key_header_value")
        return httpx.Response(200, json={"status": "ok", "message": "", "track_id": "t"})

    docs = [RagDocument(text="x", source_kind="notion", source_id="p1", title="P1", source_uri="u")]
    asyncio.run(_client(handler, api_key="secret").index_documents("proj-1", docs))
    assert captured["api_key"] == "secret"


def test_index_documents_empty_is_noop():
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("should not call LightRAG for empty docs")

    result = asyncio.run(_client(handler).index_documents("proj-1", []))
    assert result.submitted == 0


def test_index_documents_raises_ragerror_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"detail": "boom"})

    docs = [RagDocument(text="x", source_kind="jira", source_id="K-1", title="t", source_uri="u")]
    try:
        asyncio.run(_client(handler).index_documents("proj-1", docs))
        raise AssertionError("expected RagError")
    except RagError:
        pass
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_rag_adapter.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.rag'`.

- [ ] **Step 4: Implement `app/rag.py` (`index_documents` + types)**

Create `backend/app/rag.py`:

```python
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
        except httpx.HTTPError as exc:
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
                    ids.append(doc["id"])
                for start in range(0, len(ids), 100):
                    resp = await client.request(
                        "DELETE",
                        f"{self._base}/documents/delete_document",
                        params=self._params(),
                        json={"doc_ids": ids[start : start + 100]},
                    )
                    resp.raise_for_status()
        except httpx.HTTPError as exc:
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
        except httpx.HTTPError as exc:
            raise RagError(f"status failed: {exc}") from exc
        return RagStatus(total=total, by_status=by_status)
```

- [ ] **Step 5: Run the index tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_rag_adapter.py -q`
Expected: PASS (4 tests).

- [ ] **Step 6: Write failing tests for `clear_project` and `status`**

Append to `backend/tests/test_rag_adapter.py`:

```python
def _paginated_handler(documents, *, deleted):
    """Serve /documents/paginated (one page) and capture deletes."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/documents/paginated":
            return httpx.Response(
                200,
                json={
                    "documents": documents,
                    "pagination": {"total_pages": 1},
                    "status_counts": {},
                },
            )
        if request.url.path == "/documents/delete_document":
            import json

            body = json.loads(httpx.Request("DELETE", request.url, content=request.content).read())
            deleted.extend(body["doc_ids"])
            return httpx.Response(200, json={"status": "ok"})
        raise AssertionError(f"unexpected path {request.url.path}")

    return handler


def test_clear_project_deletes_only_matching_prefix():
    docs = [
        {"id": "doc-a", "file_path": "proj-1::jira::PLAT-1", "status": "processed"},
        {"id": "doc-b", "file_path": "proj-2::jira::OTHER-1", "status": "processed"},
        {"id": "doc-c", "file_path": "proj-1::notion::abc", "status": "processed"},
    ]
    deleted: list[str] = []
    count = asyncio.run(_client(_paginated_handler(docs, deleted=deleted)).clear_project("proj-1"))
    assert count == 2
    assert sorted(deleted) == ["doc-a", "doc-c"]


def test_status_counts_by_status_for_project():
    docs = [
        {"id": "1", "file_path": "proj-1::jira::A", "status": "processed"},
        {"id": "2", "file_path": "proj-1::jira::B", "status": "pending"},
        {"id": "3", "file_path": "proj-9::jira::C", "status": "processed"},
    ]
    status = asyncio.run(_client(_paginated_handler(docs, deleted=[])).status("proj-1"))
    assert isinstance(status, RagStatus)
    assert status.total == 2
    assert status.by_status == {"processed": 1, "pending": 1}
```

- [ ] **Step 7: Run all adapter tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_rag_adapter.py -q`
Expected: PASS (6 tests). `clear_project`/`status` are already implemented in Step 4.

- [ ] **Step 8: Commit**

```bash
cd backend && .venv/bin/pytest tests/test_rag_adapter.py -q
git add backend/app/rag.py backend/app/sources.py backend/tests/test_rag_adapter.py
git commit -m "feat(rag): LightRAG adapter index_documents/clear_project/status (ScrumAgent-daa)"
```

---

## Task 2: Jira read client (`app/jira_client.py`) — `ScrumAgent-chx`

**Files:**
- Create: `backend/app/jira_client.py`
- Test: `backend/tests/test_jira_client.py`

> **Endpoint note:** uses classic `GET /rest/api/3/search` (`startAt`/`maxResults`/`total`). If the target Jira Cloud has retired it (Atlassian deprecated GET `/search` in 2025), switch the pagination in `fetch_issues` to `POST /rest/api/3/search/jql` with `nextPageToken`/`isLast`; the per-issue parsing in `_to_doc` is identical. Tests use `MockTransport` and are unaffected.

- [ ] **Step 1: Write failing tests (ADF flatten + pagination)**

Create `backend/tests/test_jira_client.py`:

```python
from __future__ import annotations

import asyncio

import httpx

from app.jira_client import JiraReadClient, adf_to_text


def test_adf_to_text_flattens_paragraphs_and_lists():
    adf = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Hello world"}]},
            {
                "type": "bulletList",
                "content": [
                    {"type": "listItem", "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "one"}]}]},
                    {"type": "listItem", "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "two"}]}]},
                ],
            },
        ],
    }
    out = adf_to_text(adf)
    assert "Hello world" in out
    assert "one" in out and "two" in out


def _two_page_handler() -> "callable":
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/api/3/search"
        start = int(request.url.params.get("startAt", "0"))
        issue = {
            "key": f"PLAT-{start + 1}",
            "fields": {
                "summary": f"Issue {start + 1}",
                "description": {"type": "doc", "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Body"}]}]},
                "comment": {"comments": [
                    {"body": {"type": "doc", "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "A comment"}]}]}}]},
                "status": {"name": "Open"},
                "issuetype": {"name": "Bug"},
                "updated": "2026-06-01T10:00:00.000+0000",
            },
        }
        return httpx.Response(200, json={"startAt": start, "maxResults": 1, "total": 2, "issues": [issue]})

    return handler


def test_fetch_issues_paginates_and_normalizes():
    client = JiraReadClient(
        "https://m.atlassian.net/",
        "agent@municorn.com",
        "tok",
        page_size=1,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(_two_page_handler())),
    )
    docs = asyncio.run(client.fetch_issues("PLAT"))
    assert [d.source_id for d in docs] == ["PLAT-1", "PLAT-2"]
    first = docs[0]
    assert first.source_kind == "jira"
    assert first.title == "Issue 1"
    assert first.source_uri == "https://m.atlassian.net/browse/PLAT-1"
    assert "Body" in first.text
    assert "A comment" in first.text
    assert first.updated_at is not None
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_jira_client.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.jira_client'`.

- [ ] **Step 3: Implement `app/jira_client.py`**

Create `backend/app/jira_client.py`:

```python
"""Read-only Jira client: fetch all issues for a project key, flatten ADF to text.

Read-only ahead of the planned Rovo client (ScrumAgent-qor).
"""
from __future__ import annotations

from collections.abc import Callable

import httpx

from app.sources import SourceDocument, parse_iso_dt

_BLOCK_TYPES = {"paragraph", "heading", "blockquote", "codeBlock", "listItem", "panel"}


def adf_to_text(node: object) -> str:
    """Flatten an Atlassian Document Format node to good-enough plain text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(adf_to_text(item) for item in node)
    if not isinstance(node, dict):
        return ""
    node_type = node.get("type")
    if node_type == "text":
        return node.get("text", "")
    if node_type == "hardBreak":
        return "\n"
    inner = adf_to_text(node.get("content"))
    if node_type in _BLOCK_TYPES:
        return inner + "\n"
    return inner


class JiraReadClient:
    FIELDS = ["summary", "description", "comment", "status", "issuetype", "updated"]

    def __init__(
        self,
        site_url: str,
        user_email: str,
        api_token: str,
        *,
        page_size: int = 100,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self._site = site_url.rstrip("/")
        self._auth = (user_email, api_token)
        self._page_size = page_size
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=30.0)
        )

    async def fetch_issues(self, project_key: str) -> list[SourceDocument]:
        jql = f'project = "{project_key}" ORDER BY created ASC'
        out: list[SourceDocument] = []
        start_at = 0
        async with self._client_factory() as client:
            while True:
                resp = await client.get(
                    f"{self._site}/rest/api/3/search",
                    auth=self._auth,
                    headers={"Accept": "application/json"},
                    params={
                        "jql": jql,
                        "startAt": start_at,
                        "maxResults": self._page_size,
                        "fields": ",".join(self.FIELDS),
                    },
                )
                resp.raise_for_status()
                body = resp.json()
                issues = body.get("issues", []) or []
                for issue in issues:
                    out.append(self._to_doc(issue))
                total = body.get("total", 0)
                start_at += len(issues)
                if not issues or start_at >= total:
                    break
        return out

    def _to_doc(self, issue: dict) -> SourceDocument:
        key = issue.get("key", "")
        fields = issue.get("fields", {}) or {}
        summary = fields.get("summary") or key
        description = adf_to_text(fields.get("description")).strip()
        comments = (fields.get("comment", {}) or {}).get("comments", []) or []
        comment_text = "\n".join(
            adf_to_text(c.get("body")).strip() for c in comments
        ).strip()
        parts = [summary]
        if description:
            parts.append(description)
        if comment_text:
            parts.append("Comments:\n" + comment_text)
        return SourceDocument(
            source_kind="jira",
            source_id=key,
            title=summary,
            text="\n\n".join(parts),
            source_uri=f"{self._site}/browse/{key}",
            updated_at=parse_iso_dt(fields.get("updated")),
        )
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_jira_client.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/jira_client.py backend/tests/test_jira_client.py
git commit -m "feat(jira): read-only Jira client + ADF flatten (ScrumAgent-chx)"
```

---

## Task 3: Notion read client (`app/notion_client.py`) — `ScrumAgent-an7`

**Files:**
- Create: `backend/app/notion_client.py`
- Test: `backend/tests/test_notion_client.py`

- [ ] **Step 1: Write failing tests (block flatten + recursion + depth cap)**

Create `backend/tests/test_notion_client.py`:

```python
from __future__ import annotations

import asyncio

import httpx

from app.notion_client import NotionReadClient

ROOT = "root000000000000000000000000aaaa"
CHILD = "child0000-0000-0000-0000-0000000bbbb"


def _handler():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == f"/v1/pages/{ROOT}":
            return httpx.Response(200, json={
                "id": ROOT,
                "last_edited_time": "2026-06-10T12:00:00.000Z",
                "properties": {"Name": {"type": "title", "title": [{"plain_text": "Root Page"}]}},
            })
        if path == f"/v1/blocks/{ROOT}/children":
            return httpx.Response(200, json={"has_more": False, "next_cursor": None, "results": [
                {"type": "paragraph", "has_children": False,
                 "paragraph": {"rich_text": [{"plain_text": "Root body text"}]}},
                {"id": CHILD, "type": "child_page", "has_children": True,
                 "child_page": {"title": "Child Page"}},
            ]})
        if path == f"/v1/blocks/{CHILD}/children":
            return httpx.Response(200, json={"has_more": False, "next_cursor": None, "results": [
                {"type": "heading_1", "has_children": False,
                 "heading_1": {"rich_text": [{"plain_text": "Child heading"}]}},
            ]})
        raise AssertionError(f"unexpected path {path}")

    return handler


def _client(max_depth=5) -> NotionReadClient:
    return NotionReadClient(
        "ntn-secret",
        max_depth=max_depth,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(_handler())),
    )


def test_fetch_pages_walks_root_and_child():
    docs = asyncio.run(_client().fetch_pages(ROOT))
    by_id = {d.source_id: d for d in docs}
    assert set(by_id) == {ROOT, CHILD}
    assert by_id[ROOT].title == "Root Page"
    assert "Root body text" in by_id[ROOT].text
    assert by_id[ROOT].source_kind == "notion"
    assert by_id[ROOT].source_uri == f"https://www.notion.so/{ROOT}"
    assert by_id[CHILD].title == "Child Page"
    assert "Child heading" in by_id[CHILD].text


def test_depth_cap_stops_recursion():
    docs = asyncio.run(_client(max_depth=0).fetch_pages(ROOT))
    assert [d.source_id for d in docs] == [ROOT]  # child not visited at depth 0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_notion_client.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.notion_client'`.

- [ ] **Step 3: Implement `app/notion_client.py`**

Create `backend/app/notion_client.py`:

```python
"""Read-only Notion client: walk a page + descendant pages, flatten blocks to text.

Read-only ahead of the planned Notion MCP client (ScrumAgent-ilz).
"""
from __future__ import annotations

from collections.abc import Callable

import httpx

from app.integrations import NOTION_VERSION
from app.sources import SourceDocument, parse_iso_dt

_API = "https://api.notion.com/v1"
_TEXT_BLOCKS = {
    "paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item",
    "numbered_list_item", "to_do", "quote", "callout", "code", "toggle",
}


def _rich_text(block_body: dict | None) -> str:
    spans = (block_body or {}).get("rich_text", []) or []
    return "".join(span.get("plain_text", "") for span in spans)


def _page_url(page_id: str) -> str:
    return f"https://www.notion.so/{page_id.replace('-', '')}"


class NotionReadClient:
    def __init__(
        self,
        token: str,
        *,
        max_depth: int = 5,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self._token = token
        self._max_depth = max_depth
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=30.0)
        )

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._token}", "Notion-Version": NOTION_VERSION}

    async def fetch_pages(self, root_page_id: str) -> list[SourceDocument]:
        out: list[SourceDocument] = []
        async with self._client_factory() as client:
            await self._walk_page(client, root_page_id, None, 0, out)
        return out

    async def _walk_page(self, client, page_id, known_title, depth, out) -> None:
        title = known_title
        updated = None
        if title is None:
            page = await self._get_page(client, page_id)
            title = self._page_title(page) if page else page_id
            updated = parse_iso_dt((page or {}).get("last_edited_time"))
        text, child_pages = await self._collect(client, page_id)
        out.append(SourceDocument(
            source_kind="notion",
            source_id=page_id,
            title=title,
            text=text,
            source_uri=_page_url(page_id),
            updated_at=updated,
        ))
        if depth < self._max_depth:
            for child_id, child_title in child_pages:
                await self._walk_page(client, child_id, child_title, depth + 1, out)

    async def _get_page(self, client, page_id) -> dict | None:
        resp = await client.get(f"{_API}/pages/{page_id}", headers=self._headers())
        if resp.status_code != 200:
            return None
        return resp.json()

    def _page_title(self, page: dict | None) -> str:
        props = (page or {}).get("properties", {}) or {}
        for prop in props.values():
            if prop.get("type") == "title":
                joined = "".join(s.get("plain_text", "") for s in prop.get("title", []))
                return joined or (page or {}).get("id", "")
        return (page or {}).get("id", "")

    async def _collect(self, client, block_id) -> tuple[str, list[tuple[str, str]]]:
        lines: list[str] = []
        child_pages: list[tuple[str, str]] = []
        cursor: str | None = None
        while True:
            params: dict = {"page_size": 100}
            if cursor:
                params["start_cursor"] = cursor
            resp = await client.get(
                f"{_API}/blocks/{block_id}/children", headers=self._headers(), params=params
            )
            resp.raise_for_status()
            body = resp.json()
            for block in body.get("results", []) or []:
                btype = block.get("type")
                if btype == "child_page":
                    child_pages.append((block["id"], block.get("child_page", {}).get("title", "")))
                    continue
                if btype in _TEXT_BLOCKS:
                    text = _rich_text(block.get(btype))
                    if text:
                        lines.append(text)
                if block.get("has_children") and btype not in {"child_page", "child_database"}:
                    sub_text, sub_children = await self._collect(client, block["id"])
                    if sub_text:
                        lines.append(sub_text)
                    child_pages.extend(sub_children)
            if not body.get("has_more"):
                break
            cursor = body.get("next_cursor")
        return "\n".join(lines), child_pages
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_notion_client.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/notion_client.py backend/tests/test_notion_client.py
git commit -m "feat(notion): read-only Notion client (blocks + recursive pages) (ScrumAgent-an7)"
```

---

## Task 4: `IngestionRun` model + orchestration (`app/ingestion.py`) — `ScrumAgent-ce5`

**Files:**
- Modify: `backend/app/models/types.py` (add two enums)
- Create: `backend/app/models/ingestion.py`
- Modify: `backend/app/models/__init__.py` (register model)
- Modify: `backend/app/config.py` (add `jira_page_size`, `notion_max_depth`)
- Create: `backend/app/ingestion.py`
- Test: `backend/tests/test_ingestion_run.py`

- [ ] **Step 1: Add ingestion enums**

In `backend/app/models/types.py`, after the existing `ProjectRole` enum, add:

```python
class IngestionStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    partial = "partial"
    failed = "failed"


class IngestionTrigger(str, enum.Enum):
    created = "created"
    resync = "resync"
```

- [ ] **Step 2: Create the `IngestionRun` model**

Create `backend/app/models/ingestion.py`:

```python
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.types import (
    IngestionStatus,
    IngestionTrigger,
    JSONType,
    TimestampMixin,
    UUIDPKMixin,
)


class IngestionRun(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "ingestion_runs"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True, nullable=False
    )
    status: Mapped[IngestionStatus] = mapped_column(
        SAEnum(IngestionStatus, native_enum=False),
        default=IngestionStatus.pending,
        nullable=False,
    )
    trigger: Mapped[IngestionTrigger] = mapped_column(
        SAEnum(IngestionTrigger, native_enum=False), nullable=False
    )
    jira_total: Mapped[int | None] = mapped_column(Integer)
    jira_submitted: Mapped[int | None] = mapped_column(Integer)
    notion_total: Mapped[int | None] = mapped_column(Integer)
    notion_submitted: Mapped[int | None] = mapped_column(Integer)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    errors: Mapped[list | None] = mapped_column(JSONType)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

- [ ] **Step 3: Register the model and add config knobs**

In `backend/app/models/__init__.py`, add after the existing imports:

```python
from app.models.ingestion import IngestionRun
```

(If the module defines `__all__`, add `"IngestionRun"` to it.)

In `backend/app/config.py`, add to the `Settings` class (near the other defaults):

```python
    jira_page_size: int = 100
    notion_max_depth: int = 5
```

- [ ] **Step 4: Write the failing orchestration test**

Create `backend/tests/test_ingestion_run.py`:

```python
from __future__ import annotations

import asyncio

from app.database import init_db, make_engine
from app.ingestion import execute_run
from app.models import Project, ProjectCredential, ProjectMember
from app.models.ingestion import IngestionRun
from app.models.types import IngestionStatus, IngestionTrigger, ProjectRole
from app.rag import IndexResult, RagError
from app.security import crypto
from app.sources import SourceDocument
from sqlalchemy.orm import sessionmaker


def _session():
    crypto.configure("test-secret")
    engine = make_engine("sqlite://")
    init_db(engine)
    return sessionmaker(bind=engine, autoflush=False, future=True)()


def _project(db, *, with_jira=False, with_notion=False) -> Project:
    project = Project(
        owner_id=1, name="P", agent_email="a@municorn.com", google_connected=True,
        jira_site_url="https://m.atlassian.net" if with_jira else None,
        jira_user_email="a@municorn.com" if with_jira else None,
        jira_project_key="PLAT" if with_jira else None,
        notion_page_id="abc" if with_notion else None,
    )
    project.credential = ProjectCredential(
        google_refresh_token="rt",
        jira_api_token="t" if with_jira else None,
        notion_token="t" if with_notion else None,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


class FakeJira:
    def __init__(self, docs): self._docs = docs
    async def fetch_issues(self, project_key): return self._docs


class FakeNotion:
    def __init__(self, docs): self._docs = docs
    async def fetch_pages(self, root): return self._docs


class FakeRag:
    def __init__(self): self.cleared = []
    async def clear_project(self, pid): self.cleared.append(pid); return 0
    async def index_documents(self, pid, docs): return IndexResult(submitted=len(list(docs)), track_id="t")


class ExplodingRag(FakeRag):
    async def index_documents(self, pid, docs): raise RagError("down")


def _doc(i):
    return SourceDocument(source_kind="jira", source_id=f"K-{i}", title="t", text="b", source_uri="u")


def _run(db, project, trigger=IngestionTrigger.created):
    run = IngestionRun(project_id=project.id, trigger=trigger, status=IngestionStatus.pending)
    db.add(run); db.commit(); db.refresh(run)
    return run


def test_completed_when_all_sources_index():
    db = _session()
    project = _project(db, with_jira=True, with_notion=True)
    run = _run(db, project)
    rag = FakeRag()
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        jira_reader=FakeJira([_doc(1), _doc(2)]), notion_reader=FakeNotion([_doc(3)]),
    ))
    assert run.status == IngestionStatus.completed
    assert run.jira_total == 2 and run.jira_submitted == 2
    assert run.notion_total == 1 and run.notion_submitted == 1
    assert run.failed_count == 0
    assert run.started_at is not None and run.finished_at is not None


def test_partial_when_one_source_fails():
    db = _session()
    project = _project(db, with_jira=True, with_notion=True)
    run = _run(db, project)

    class HalfRag(FakeRag):
        def __init__(self): super().__init__(); self.n = 0
        async def index_documents(self, pid, docs):
            self.n += 1
            if self.n == 1:
                raise RagError("jira down")
            return IndexResult(submitted=len(list(docs)))

    asyncio.run(execute_run(
        run, session=db, project=project, rag=HalfRag(),
        jira_reader=FakeJira([_doc(1)]), notion_reader=FakeNotion([_doc(2)]),
    ))
    assert run.status == IngestionStatus.partial
    assert run.failed_count == 1
    assert run.errors and any("jira" in e for e in run.errors)


def test_failed_when_nothing_submitted():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=ExplodingRag(), jira_reader=FakeJira([_doc(1)]),
    ))
    assert run.status == IngestionStatus.failed


def test_resync_clears_before_indexing():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project, trigger=IngestionTrigger.resync)
    rag = FakeRag()
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag, jira_reader=FakeJira([_doc(1)]),
    ))
    assert rag.cleared == [project.id]
    assert run.status == IngestionStatus.completed
```

- [ ] **Step 5: Run to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_ingestion_run.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.ingestion'`.

- [ ] **Step 6: Implement `app/ingestion.py`**

Create `backend/app/ingestion.py`:

```python
"""Background ingestion: read Jira/Notion sources and index them into LightRAG.

`execute_run` is the testable core (collaborators injected). `run_ingestion` is the
production entry that builds real clients from a run's project credentials.
`IngestionRunner` is the schedulable seam overridden in tests.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Sequence
from datetime import datetime, timezone

from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.jira_client import JiraReadClient
from app.models import Project
from app.models.ingestion import IngestionRun
from app.models.types import IngestionStatus, IngestionTrigger
from app.notion_client import NotionReadClient
from app.rag import RagClient, RagDocument
from app.sources import SourceDocument

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_rag(docs: Sequence[SourceDocument]) -> list[RagDocument]:
    return [
        RagDocument(
            text=d.text,
            source_kind=d.source_kind,
            source_id=d.source_id,
            title=d.title,
            source_uri=d.source_uri,
        )
        for d in docs
    ]


async def execute_run(
    run: IngestionRun,
    *,
    session: Session,
    project: Project,
    rag,
    jira_reader=None,
    notion_reader=None,
) -> None:
    run.status = IngestionStatus.running
    run.started_at = _now()
    session.commit()

    if run.trigger == IngestionTrigger.resync:
        try:
            await rag.clear_project(project.id)
        except Exception as exc:  # noqa: BLE001 — surface as a hard failure
            run.status = IngestionStatus.failed
            run.error = f"clear_project failed: {exc}"
            run.finished_at = _now()
            session.commit()
            return

    failures: list[str] = []

    if jira_reader is not None and project.jira_project_key:
        try:
            docs = await jira_reader.fetch_issues(project.jira_project_key)
            run.jira_total = len(docs)
            result = await rag.index_documents(project.id, _to_rag(docs))
            run.jira_submitted = result.submitted
        except Exception as exc:  # noqa: BLE001 — isolate per source
            logger.warning("jira ingest failed for %s: %s", project.id, exc)
            run.jira_total = run.jira_total or 0
            run.jira_submitted = 0
            failures.append(f"jira: {exc}")

    if notion_reader is not None and project.notion_page_id:
        try:
            docs = await notion_reader.fetch_pages(project.notion_page_id)
            run.notion_total = len(docs)
            result = await rag.index_documents(project.id, _to_rag(docs))
            run.notion_submitted = result.submitted
        except Exception as exc:  # noqa: BLE001 — isolate per source
            logger.warning("notion ingest failed for %s: %s", project.id, exc)
            run.notion_total = run.notion_total or 0
            run.notion_submitted = 0
            failures.append(f"notion: {exc}")

    submitted = (run.jira_submitted or 0) + (run.notion_submitted or 0)
    if failures and submitted == 0:
        run.status = IngestionStatus.failed
    elif failures:
        run.status = IngestionStatus.partial
    else:
        run.status = IngestionStatus.completed
    run.failed_count = len(failures)
    run.errors = failures or None
    run.finished_at = _now()
    session.commit()


async def run_ingestion(
    run_id: str, *, session_factory: Callable[[], Session], settings: Settings
) -> None:
    session = session_factory()
    try:
        run = session.get(IngestionRun, run_id)
        if run is None:
            return
        project = session.get(Project, run.project_id)
        credential = project.credential if project else None
        if project is None or credential is None:
            run.status = IngestionStatus.failed
            run.error = "project or credentials missing"
            run.finished_at = _now()
            session.commit()
            return

        rag = RagClient.from_settings(settings)
        jira_reader = None
        if project.jira_project_key and project.jira_site_url and credential.jira_api_token:
            jira_reader = JiraReadClient(
                project.jira_site_url,
                project.jira_user_email or "",
                credential.jira_api_token,
                page_size=settings.jira_page_size,
            )
        notion_reader = None
        if project.notion_page_id and credential.notion_token:
            notion_reader = NotionReadClient(
                credential.notion_token, max_depth=settings.notion_max_depth
            )
        await execute_run(
            run,
            session=session,
            project=project,
            rag=rag,
            jira_reader=jira_reader,
            notion_reader=notion_reader,
        )
    except Exception:  # noqa: BLE001 — never let a background crash go silent
        logger.exception("ingestion run %s crashed", run_id)
        run = session.get(IngestionRun, run_id)
        if run is not None and run.status in (
            IngestionStatus.pending,
            IngestionStatus.running,
        ):
            run.status = IngestionStatus.failed
            run.error = "unexpected error"
            run.finished_at = _now()
            session.commit()
    finally:
        session.close()


class IngestionRunner:
    """Schedules background ingestion. Overridden in tests to assert enqueue only."""

    def __init__(self, settings: Settings, session_factory: Callable[[], Session]) -> None:
        self._settings = settings
        self._session_factory = session_factory

    def schedule(self, run_id: str) -> None:
        asyncio.create_task(
            run_ingestion(
                run_id, session_factory=self._session_factory, settings=self._settings
            )
        )
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_ingestion_run.py -q`
Expected: PASS (4 tests).

- [ ] **Step 8: Run the full backend suite (model registration sanity)**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS (all existing tests still green; the new `ingestion_runs` table is created by `init_db`).

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/types.py backend/app/models/ingestion.py backend/app/models/__init__.py backend/app/config.py backend/app/ingestion.py backend/tests/test_ingestion_run.py
git commit -m "feat(ingestion): IngestionRun model + run orchestration (ScrumAgent-ce5)"
```

---

## Task 5: Trigger + status/resync endpoints (`app/routers/projects.py`) — `ScrumAgent-6v5`

**Files:**
- Modify: `backend/app/deps.py` (add `get_ingestion_runner`)
- Modify: `backend/app/routers/projects.py` (admin gate, schemas, 2 endpoints, trigger)
- Test: `backend/tests/test_knowledge_base_api.py`

- [ ] **Step 1: Add the runner dependency**

In `backend/app/deps.py`, add near `get_integration_validators`:

```python
def get_ingestion_runner(
    settings: Settings = Depends(get_settings),
) -> "IngestionRunner":
    from app.ingestion import IngestionRunner

    return IngestionRunner(settings, _session_factory())
```

(`_session_factory()` is the existing module-level sessionmaker factory used by `get_db`. `IngestionRunner.schedule` calls it to open its own background session.)

- [ ] **Step 2: Write the failing endpoint tests**

Create `backend/tests/test_knowledge_base_api.py`:

```python
from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.main import app
from app.models import Project, ProjectCredential, ProjectMember, User
from app.models.ingestion import IngestionRun
from app.models.types import IngestionStatus, IngestionTrigger, ProjectRole
from app.security import create_access_token

SECRET = "router-test-secret"


def _settings() -> Settings:
    return Settings(
        _env_file=None, secret_key=SECRET, openai_api_key="k",
        google_client_id="cid", google_client_secret="csec",
        backend_base_url="http://testserver", frontend_base_url="http://localhost:3000",
        allowed_domain="municorn.com",
    )


class FakeRunner:
    def __init__(self) -> None:
        self.scheduled: list[str] = []

    def schedule(self, run_id: str) -> None:
        self.scheduled.append(run_id)


@pytest.fixture
def runner() -> FakeRunner:
    return FakeRunner()


@pytest.fixture
def client(db_session, runner):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_ingestion_runner] = lambda: runner
    # status endpoint builds a real RagClient; point it at a transport that returns no docs
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


def _auth(uid: int) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(uid), SECRET, extra={'env': 'production'})}"}


def _user(db, email="alice@municorn.com", sub="sub-alice") -> User:
    user = User(google_sub=sub, email=email, name="Alice")
    db.add(user); db.commit(); db.refresh(user)
    return user


def _project(db, owner, role=ProjectRole.admin, *, with_jira=True) -> Project:
    project = Project(
        owner_id=owner.id, name="P", agent_email="a@municorn.com", google_connected=True,
        jira_site_url="https://m.atlassian.net" if with_jira else None,
        jira_user_email="a@municorn.com" if with_jira else None,
        jira_project_key="PLAT" if with_jira else None,
    )
    project.credential = ProjectCredential(google_refresh_token="rt", jira_api_token="t" if with_jira else None)
    project.members.append(ProjectMember(user_id=owner.id, role=role))
    db.add(project); db.commit(); db.refresh(project)
    return project


def test_resync_admin_creates_run_and_schedules(client, db_session, runner):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.admin)
    resp = client.post(f"/projects/{project.id}/knowledge-base/resync", headers=_auth(user.id))
    assert resp.status_code == 202
    body = resp.json()
    assert body["trigger"] == "resync"
    runs = db_session.query(IngestionRun).filter(IngestionRun.project_id == project.id).all()
    assert len(runs) == 1
    assert runner.scheduled == [runs[0].id]


def test_resync_non_admin_forbidden(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.member)
    resp = client.post(f"/projects/{project.id}/knowledge-base/resync", headers=_auth(user.id))
    assert resp.status_code == 403


def test_resync_without_integration_conflict(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.admin, with_jira=False)
    resp = client.post(f"/projects/{project.id}/knowledge-base/resync", headers=_auth(user.id))
    assert resp.status_code == 409


def test_status_returns_last_run(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user)
    run = IngestionRun(
        project_id=project.id, trigger=IngestionTrigger.created,
        status=IngestionStatus.completed, jira_total=3, jira_submitted=3, failed_count=0,
    )
    db_session.add(run); db_session.commit()
    resp = client.get(f"/projects/{project.id}/knowledge-base/status", headers=_auth(user.id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["last_run"]["status"] == "completed"
    assert body["last_run"]["jira_submitted"] == 3
```

> Note: `test_status_returns_last_run` calls `rag.status`, which hits LightRAG. Since no LightRAG is reachable in tests, the endpoint must swallow `RagError`/transport errors and return `rag: null` (implemented in Step 4). The assertion only checks `last_run`, so a `null` rag block is fine.

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_knowledge_base_api.py -q`
Expected: FAIL — `get_ingestion_runner` not found / endpoints return 404/405.

- [ ] **Step 4: Implement the admin gate, schemas, endpoints, and trigger**

In `backend/app/routers/projects.py`:

(a) Extend imports:

```python
from app.deps import (
    get_agent_google_oauth,
    get_current_user,
    get_db,
    get_google_calendar,
    get_ingestion_runner,
    get_integration_validators,
    get_settings,
    is_agent_preview,
)
from app.ingestion import IngestionRunner
from app.models import (
    IngestionRun,
    LlmUsage,
    PendingOAuth,
    PendingProjectMember,
    Project,
    ProjectAgentSettings,
    ProjectCredential,
    ProjectMember,
    User,
)
from app.models.types import (
    IngestionStatus,
    IngestionTrigger,
    ProjectRole,
    ResponseStyle,
    UsageKind,
    uuid_str,
)
from app.rag import RagClient, RagError
```

(b) Add an admin gate after `require_project_access` (around line 96):

```python
def require_project_admin(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    see_all: bool = Depends(can_access_all_projects),
) -> Project:
    """Resolve ``{project_id}`` and require the caller be a project admin.

    404 when missing/not-a-member (don't leak existence); 403 when a member but
    not admin. Aligns with the role-enforcement direction in ScrumAgent-ho8.
    """
    project = db.get(Project, project_id)
    if project is None or not (see_all or _is_member(db, project_id, user.id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if not see_all:
        membership = db.get(
            ProjectMember, {"project_id": project_id, "user_id": user.id}
        )
        if membership is None or membership.role != ProjectRole.admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")
    return project
```

(c) Add response schemas (near the other `BaseModel`s, e.g. after `ProjectOut`):

```python
class IngestionRunOut(BaseModel):
    id: str
    status: str
    trigger: str
    jira_total: int | None
    jira_submitted: int | None
    notion_total: int | None
    notion_submitted: int | None
    failed_count: int
    error: str | None
    created_at: datetime
    finished_at: datetime | None


class RagStatusOut(BaseModel):
    total: int
    by_status: dict[str, int]


class KnowledgeBaseStatusOut(BaseModel):
    last_run: IngestionRunOut | None
    rag: RagStatusOut | None
```

(d) Add a serializer helper near `_serialize` (around line 1150):

```python
def _serialize_run(run: IngestionRun) -> IngestionRunOut:
    return IngestionRunOut(
        id=run.id,
        status=run.status.value,
        trigger=run.trigger.value,
        jira_total=run.jira_total,
        jira_submitted=run.jira_submitted,
        notion_total=run.notion_total,
        notion_submitted=run.notion_submitted,
        failed_count=run.failed_count,
        error=run.error,
        created_at=run.created_at,
        finished_at=run.finished_at,
    )
```

(e) Add the two endpoints (anywhere among the other `@router` routes, e.g. after the integrations endpoints):

```python
@router.get(
    "/{project_id}/knowledge-base/status", response_model=KnowledgeBaseStatusOut
)
async def knowledge_base_status(
    project: Project = Depends(require_project_access),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> KnowledgeBaseStatusOut:
    run = (
        db.query(IngestionRun)
        .filter(IngestionRun.project_id == project.id)
        .order_by(IngestionRun.created_at.desc())
        .first()
    )
    rag_out: RagStatusOut | None = None
    try:
        rag_status = await RagClient.from_settings(settings).status(project.id)
        rag_out = RagStatusOut(total=rag_status.total, by_status=rag_status.by_status)
    except RagError:
        rag_out = None
    return KnowledgeBaseStatusOut(
        last_run=_serialize_run(run) if run else None, rag=rag_out
    )


@router.post(
    "/{project_id}/knowledge-base/resync",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=IngestionRunOut,
)
def resync_knowledge_base(
    project: Project = Depends(require_project_admin),
    db: Session = Depends(get_db),
    runner: IngestionRunner = Depends(get_ingestion_runner),
) -> IngestionRunOut:
    if not (project.jira_project_key or project.notion_page_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "No Jira/Notion integration to sync"
        )
    run = IngestionRun(
        project_id=project.id,
        trigger=IngestionTrigger.resync,
        status=IngestionStatus.pending,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    runner.schedule(run.id)
    return _serialize_run(run)
```

(f) Wire the create-time trigger. Change the `create_project` signature to add the runner dependency:

```python
async def create_project(
    req: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    validators: IntegrationValidators = Depends(get_integration_validators),
    runner: IngestionRunner = Depends(get_ingestion_runner),
) -> ProjectOut:
```

And replace the commit/return tail (currently lines 408-412):

```python
    db.add(project)
    db.delete(pending)  # one-shot grant consumed
    db.commit()
    db.refresh(project)

    if project.jira_project_key or project.notion_page_id:
        run = IngestionRun(
            project_id=project.id,
            trigger=IngestionTrigger.created,
            status=IngestionStatus.pending,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        runner.schedule(run.id)

    return _serialize(project, db)
```

- [ ] **Step 5: Run the endpoint tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_knowledge_base_api.py -q`
Expected: PASS (4 tests).

- [ ] **Step 6: Add a create-project trigger test**

Append to `backend/tests/test_knowledge_base_api.py` a test that creating a project with a Jira integration enqueues a run. Mirror the existing project-creation flow in `tests/test_projects_api.py` (it sets up a `PendingOAuth` and posts to `/projects`). Concretely:

```python
def test_create_project_with_jira_enqueues_run(client, db_session, runner):
    from app.models import PendingOAuth

    user = _user(db_session)
    pending = PendingOAuth(
        user_id=user.id, provider="google", account_email="agent@municorn.com",
        refresh_token="1//rt", scopes="openid email",
    )
    db_session.add(pending); db_session.commit(); db_session.refresh(pending)

    # Jira validation is network-touching; override validators to pass.
    from app import deps
    from app.integrations import ValidationResult

    class _OkValidators:
        async def validate_jira(self, **_kw): return ValidationResult(ok=True)
        async def validate_notion(self, **_kw): return ValidationResult(ok=True)

    app.dependency_overrides[deps.get_integration_validators] = lambda: _OkValidators()

    resp = client.post(
        "/projects",
        headers=_auth(user.id),
        json={
            "name": "Telecom",
            "google_auth_session_id": pending.id,
            "jira": {"site_url": "https://m.atlassian.net", "user_email": "agent@municorn.com",
                     "api_token": "tok", "project_key": "PLAT"},
        },
    )
    assert resp.status_code == 201
    assert len(runner.scheduled) == 1
```

> Confirm the exact `ProjectCreate` / `JiraConfig` request field names against `tests/test_projects_api.py` before finalizing (the project-creation request shape lives there); adjust the JSON keys to match.

- [ ] **Step 7: Run to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_knowledge_base_api.py -q`
Expected: PASS (5 tests).

- [ ] **Step 8: Run the full suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS (everything green, including existing `tests/test_projects_api.py` — the added `runner` dependency has a real default and does not change create responses).

- [ ] **Step 9: Commit**

```bash
git add backend/app/deps.py backend/app/routers/projects.py backend/tests/test_knowledge_base_api.py
git commit -m "feat(api): backlog ingestion trigger + knowledge-base status/resync (ScrumAgent-6v5)"
```

---

## Task 6: Compose smoke + docs/wiki

**Files:**
- Modify: `wiki/modules/rag.md` (mark `index_documents`/`clear_project`/`status` implemented; note ingestion flow)
- Create: `wiki/flows/backlog-ingestion.md` (new flow page) and link from `wiki/index.md`
- Modify: `wiki/log.md` (dated entry at top) and `wiki/hot.md` (refresh ~500-word summary)

- [ ] **Step 1: Optional real smoke (manual, if LightRAG stack is up)**

Bring up the stack and confirm a real round-trip:

```bash
docker-compose up -d postgres lightrag backend
# create a project with a real Jira/Notion integration via the UI/API, then:
curl -s http://localhost:8000/projects/<id>/knowledge-base/status -H "Authorization: Bearer <token>" | python3 -m json.tool
```

Expected: `last_run.status` transitions to `completed`/`partial`; `rag.total` > 0 after processing. If LightRAG is down, `rag` is `null` and the project still works (RAG never blocks the app).

- [ ] **Step 2: Update the wiki**

Per `CLAUDE.md`: update `wiki/modules/rag.md` (status of the write path), add `wiki/flows/backlog-ingestion.md` describing the create→enqueue→fetch→index→status flow, link it from `wiki/index.md`, append a dated entry at the top of `wiki/log.md`, and overwrite `wiki/hot.md` with a fresh summary. Keep `bd` task tracking out of the wiki.

- [ ] **Step 3: Commit**

```bash
git add wiki/
git commit -m "docs(wiki): backlog ingestion flow + RAG write-path status (ScrumAgent-lcw)"
```

---

## Closing the epic

After Tasks 1-5 land green and the wiki is updated:

```bash
bd close daa chx an7 ce5 6v5 --reason "Implemented per plan 2026-06-17-jira-notion-backlog-ingestion.md"
bd close lcw --reason "Backlog text ingestion into LightRAG shipped; images/auto-sync deferred (separate slices)"
```

Then follow the `CLAUDE.md` session-close protocol (pull --rebase, `bd dolt push`, `git push`).

## Self-review notes (run before executing)

- **Spec coverage:** adapter (Task 1) ✓; Jira reader (Task 2) ✓; Notion reader (Task 3) ✓; `IngestionRun` + worker + error isolation + resync clear (Task 4) ✓; trigger + injectable runner + status + admin-only resync (Task 5) ✓; smoke/docs (Task 6) ✓. Images / auto-sync / chat retrieve are explicit non-goals — no tasks, by design.
- **Type consistency:** `SourceDocument(source_kind, source_id, title, text, source_uri, updated_at)` produced by both readers and consumed by `_to_rag`; `RagDocument(text, source_kind, source_id, title, source_uri)`; `IndexResult(submitted, track_id, failed, errors)`; `RagStatus(total, by_status)`; `RagError`; `IngestionStatus`/`IngestionTrigger` enums; `IngestionRunner.schedule(run_id)`; `execute_run`/`run_ingestion` signatures — all names match across tasks.
- **Open verification (flagged, not placeholders):** (1) Jira `GET /search` vs `POST /search/jql` for the target Cloud instance (localized to `fetch_issues`); (2) exact `ProjectCreate`/`JiraConfig` JSON keys for the Task 5 Step 6 test (cross-check `tests/test_projects_api.py`); (3) LightRAG `PaginationInfo.total_pages` key — code already falls back to short-page detection if absent.
