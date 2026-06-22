# Incremental RAG Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an `auto` ingestion run re-extract only changed Jira/Notion items and reconcile deletions, instead of clearing and re-indexing the whole backlog every tick.

**Architecture:** A new `ProjectSyncState` table holds a data-driven per-source high-watermark (max `updated`/`last_edited_time` observed). `execute_run` keeps its destructive full path for `created`/`resync`/cold-start `auto`, and gains an incremental path for `auto` when watermarks exist: fetch only changed items (Jira `updated >= wm` JQL; Notion per-page `last_edited_time`), `clear_source`+re-index each, detect deletions via a new `RagBackend.list_source_ids`, and advance the watermark. A failed source fetch never triggers deletions.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy (SQLite app DB), httpx, pytest. RAG via `app/rag` adapters (LightRAG REST + Vertex SDK).

## Global Constraints

- Issue: **ScrumAgent-3wq**. Spec: `docs/superpowers/specs/2026-06-22-incremental-rag-sync-design.md`.
- Tests run from `backend/`: `uv run pytest -q` (full) or `uv run pytest tests/FILE::TEST -v` (single). No `ruff` in the uv env.
- **No Alembic.** New tables auto-create via `Base.metadata.create_all` (`app/database.py:61`) — register every model in `app/models/__init__.py`. Adding columns to an existing table needs a manual `ALTER` script.
- App code touches RAG **only** through `app/rag` adapters. Provenance: LightRAG `file_source` `"{project_id}::{kind}::{id}"`; Vertex display_name `"{kind}::{id}"`.
- LightRAG has **no upsert** → a changed item must be `clear_source`d before re-indexing or it duplicates.
- Watermark is **data-driven** (max observed timestamp), never wall-clock. JQL `updated` is **minute-granular** → format watermark `"%Y/%m/%d %H:%M"` and filter with `>=` (boundary re-index is idempotent, harmless).
- **Deletion detection must never run when a source fetch failed** (a transient outage must not look like "everything deleted").
- TDD, frequent commits. Conventional commits scoped `(rag)`/`(ingestion)`/`(jira)`/`(notion)`, referencing `(ScrumAgent-3wq)`, ending with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## File Structure

- `backend/app/models/project.py` — **modify**: add `ProjectSyncState` (1:1 with Project, lazily created, mirrors `ProjectAgentSettings`).
- `backend/app/models/__init__.py` — **modify**: register `ProjectSyncState`.
- `backend/app/models/ingestion.py` — **modify**: add `jira_deleted` / `notion_deleted` columns.
- `backend/scripts/migrate_2026_06_22_ingestion_deleted.py` — **create**: idempotent `ALTER` for existing DBs.
- `backend/app/rag/base.py` — **modify**: add `list_source_ids` to the `RagBackend` protocol.
- `backend/app/rag/lightrag.py` — **modify**: implement `list_source_ids`.
- `backend/app/rag/vertex.py` — **modify**: implement `list_source_ids`.
- `backend/app/jira_client.py` — **modify**: add `fetch_issue_index`; add `updated_since` to `fetch_issues`.
- `backend/app/notion_client.py` — **modify**: fetch `last_edited_time` for every page.
- `backend/app/ingestion.py` — **modify**: split into `_full_run`/`_incremental_run`/`_finalize_status`, watermark plumbing, deletion detection, outage guard.
- Tests: `tests/test_models_project.py`, `tests/test_ingestion_run.py`, `tests/test_rag_adapter.py`, `tests/test_rag_vertex.py`, `tests/test_jira_client.py`, `tests/test_notion_client.py`.

---

### Task 1: `ProjectSyncState` model

**Files:**
- Modify: `backend/app/models/project.py` (append a new model)
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_models_project.py`

**Interfaces:**
- Produces: `ProjectSyncState(project_id: str, jira_synced_until: datetime|None, notion_synced_until: datetime|None)`, table `project_sync_state`, registered on `Base.metadata`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_models_project.py`:

```python
def test_project_sync_state_defaults_and_persists():
    from datetime import datetime, timezone
    from app.database import init_db, make_engine
    from app.models import Project, ProjectSyncState
    from app.models.user import User
    from app.security import crypto
    from sqlalchemy.orm import sessionmaker

    crypto.configure("test-secret")
    engine = make_engine("sqlite://")
    init_db(engine)
    db = sessionmaker(bind=engine, autoflush=False, future=True)()

    user = User(google_sub="s", email="a@m.com", name="A")
    db.add(user); db.commit(); db.refresh(user)
    project = Project(owner_id=user.id, name="P", agent_email="a@m.com")
    db.add(project); db.commit(); db.refresh(project)

    state = ProjectSyncState(project_id=project.id)
    db.add(state); db.commit(); db.refresh(state)
    assert state.jira_synced_until is None
    assert state.notion_synced_until is None

    state.jira_synced_until = datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc)
    db.commit(); db.refresh(state)
    assert state.jira_synced_until.year == 2026
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_models_project.py::test_project_sync_state_defaults_and_persists -v`
Expected: FAIL — `ImportError: cannot import name 'ProjectSyncState'`.

- [ ] **Step 3: Add the model**

Append to `backend/app/models/project.py` (after `ProjectAgentSettings`):

```python
class ProjectSyncState(TimestampMixin, Base):
    """Per-project incremental-sync watermarks (1:1 with Project, row created lazily).

    No row means "never incrementally synced" → the next auto run does a full pass
    and seeds these. Each watermark is the max source timestamp observed so far
    (Jira ``updated`` / Notion ``last_edited_time``), used as the ``>=`` lower bound
    on the next incremental fetch. See ScrumAgent-3wq.
    """

    __tablename__ = "project_sync_state"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), primary_key=True
    )
    jira_synced_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    notion_synced_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    project: Mapped["Project"] = relationship()
```

(`DateTime`, `ForeignKey`, `func`, `Mapped`, `mapped_column`, `datetime`, `TimestampMixin`, `Base` are already imported in this file.)

- [ ] **Step 4: Register the model**

In `backend/app/models/__init__.py`, add `ProjectSyncState` to both the `from app.models.project import (...)` block and `__all__`:

```python
from app.models.project import (
    PendingOAuth,
    PendingProjectMember,
    Project,
    ProjectAgentSettings,
    ProjectCredential,
    ProjectMember,
    ProjectSyncState,
)
```
```python
    "ProjectAgentSettings",
    "ProjectSyncState",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_models_project.py::test_project_sync_state_defaults_and_persists -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/app/models/project.py backend/app/models/__init__.py backend/tests/test_models_project.py
rtk git commit -m "feat(ingestion): ProjectSyncState table for incremental sync watermarks (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `IngestionRun` deleted counters + migration

**Files:**
- Modify: `backend/app/models/ingestion.py:32-35`
- Create: `backend/scripts/migrate_2026_06_22_ingestion_deleted.py`
- Test: `backend/tests/test_ingestion_run.py`

**Interfaces:**
- Produces: `IngestionRun.jira_deleted: int|None`, `IngestionRun.notion_deleted: int|None`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_ingestion_run.py`:

```python
def test_ingestion_run_has_deleted_counters():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project)
    assert run.jira_deleted is None
    assert run.notion_deleted is None
    run.jira_deleted = 3
    db.commit(); db.refresh(run)
    assert run.jira_deleted == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py::test_ingestion_run_has_deleted_counters -v`
Expected: FAIL — `AttributeError: 'IngestionRun' object has no attribute 'jira_deleted'`.

- [ ] **Step 3: Add the columns**

In `backend/app/models/ingestion.py`, after the `notion_submitted` column (line 35):

```python
    jira_total: Mapped[int | None] = mapped_column(Integer)
    jira_submitted: Mapped[int | None] = mapped_column(Integer)
    notion_total: Mapped[int | None] = mapped_column(Integer)
    notion_submitted: Mapped[int | None] = mapped_column(Integer)
    jira_deleted: Mapped[int | None] = mapped_column(Integer)
    notion_deleted: Mapped[int | None] = mapped_column(Integer)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py::test_ingestion_run_has_deleted_counters -v`
Expected: PASS (the test builds a fresh in-memory DB via `init_db`, so `create_all` includes the new columns).

- [ ] **Step 5: Write the idempotent migration for existing DBs**

Create `backend/scripts/migrate_2026_06_22_ingestion_deleted.py`:

```python
"""One-off migration (no Alembic): add ingestion_runs.jira_deleted / notion_deleted.

Fresh DBs get these from create_all automatically; this patches pre-existing dev/prod
DBs. Idempotent — safe to run repeatedly. ScrumAgent-3wq.

Run: cd backend && uv run python scripts/migrate_2026_06_22_ingestion_deleted.py
"""
from __future__ import annotations

from sqlalchemy import inspect, text

from app.config import Settings
from app.database import make_engine


def main() -> None:
    engine = make_engine(Settings().database_url)
    existing = {c["name"] for c in inspect(engine).get_columns("ingestion_runs")}
    with engine.begin() as conn:
        if "jira_deleted" not in existing:
            conn.execute(text("ALTER TABLE ingestion_runs ADD COLUMN jira_deleted INTEGER"))
            print("added ingestion_runs.jira_deleted")
        if "notion_deleted" not in existing:
            conn.execute(text("ALTER TABLE ingestion_runs ADD COLUMN notion_deleted INTEGER"))
            print("added ingestion_runs.notion_deleted")
    print("migration complete")


if __name__ == "__main__":
    main()
```

Note: confirm `Settings().database_url` is the field name used in `app/config.py` (grep `database_url`); adjust if the app exposes a cached `get_settings()` instead.

- [ ] **Step 6: Verify the migration runs clean on the dev DB**

Run: `cd backend && uv run python scripts/migrate_2026_06_22_ingestion_deleted.py`
Expected: prints either the "added …" lines (first run) or just `migration complete` (already-migrated). No traceback.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/app/models/ingestion.py backend/scripts/migrate_2026_06_22_ingestion_deleted.py backend/tests/test_ingestion_run.py
rtk git commit -m "feat(ingestion): add jira_deleted/notion_deleted counters + migration (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `RagBackend.list_source_ids` — protocol + LightRAG + Vertex

**Files:**
- Modify: `backend/app/rag/base.py:78-91`
- Modify: `backend/app/rag/lightrag.py`
- Modify: `backend/app/rag/vertex.py`
- Test: `backend/tests/test_rag_adapter.py`, `backend/tests/test_rag_vertex.py`

**Interfaces:**
- Produces: `async def list_source_ids(self, project_id: str) -> set[tuple[str, str]]` on `RagBackend`, `LightRagBackend`, `VertexRagBackend` — returns `{(source_kind, source_id), …}` currently indexed for the project.

- [ ] **Step 1: Write the failing LightRAG test**

Add to `backend/tests/test_rag_adapter.py`:

```python
def test_list_source_ids_parses_and_filters_by_project():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/documents/paginated"
        return httpx.Response(200, json={
            "documents": [
                {"id": "1", "file_path": "proj-1::jira::PLAT-1", "status": "processed"},
                {"id": "2", "file_path": "proj-1::notion::pg-9", "status": "processed"},
                {"id": "3", "file_path": "proj-2::jira::OTHER-1", "status": "processed"},
                {"id": "4", "file_path": "proj-1::malformed", "status": "processed"},
            ],
            "pagination": {"total_pages": 1},
        })

    ids = asyncio.run(_client(handler).list_source_ids("proj-1"))
    assert ids == {("jira", "PLAT-1"), ("notion", "pg-9")}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_rag_adapter.py::test_list_source_ids_parses_and_filters_by_project -v`
Expected: FAIL — `AttributeError: 'LightRagBackend' object has no attribute 'list_source_ids'`.

- [ ] **Step 3: Add to the protocol**

In `backend/app/rag/base.py`, inside the `RagBackend` protocol (after `clear_source`, before `status`):

```python
    async def clear_source(
        self, project_id: str, source_kind: str, source_id: str
    ) -> int: ...
    async def list_source_ids(self, project_id: str) -> set[tuple[str, str]]: ...
    async def status(self, project_id: str) -> "RagStatus": ...
```

- [ ] **Step 4: Implement on LightRAG**

In `backend/app/rag/lightrag.py`, add after `clear_source` (it reuses the existing `_iter_project_docs` and imported `_parse_citation`):

```python
    async def list_source_ids(self, project_id: str) -> set[tuple[str, str]]:
        """The (kind, id) of every doc currently indexed for the project — the
        authoritative set used to reconcile deletions (ScrumAgent-3wq)."""
        out: set[tuple[str, str]] = set()
        try:
            async with self._client_factory() as client:
                async for doc in self._iter_project_docs(client, project_id):
                    citation = _parse_citation(str(doc.get("file_path", "")))
                    if citation is not None:
                        out.add((citation.source_kind, citation.source_id))
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"list_source_ids failed: {exc}") from exc
        return out
```

- [ ] **Step 5: Run the LightRAG test to verify it passes**

Run: `cd backend && uv run pytest tests/test_rag_adapter.py::test_list_source_ids_parses_and_filters_by_project -v`
Expected: PASS.

- [ ] **Step 6: Write the failing Vertex test**

Add to `backend/tests/test_rag_vertex.py` (mirrors the existing `clear_source`/`status` tests — seed a file via `index_documents`, then read it back; use the module's `FakeRag` and `_backend` helpers):

```python
def test_list_source_ids_from_corpus_files():
    fake = FakeRag()
    backend = _backend(fake)
    asyncio.run(backend.index_documents("p1", [
        RagDocument(text="x", source_kind="jira", source_id="PLAT-1",
                    title="t", source_uri="u"),
        RagDocument(text="y", source_kind="notion", source_id="pg-9",
                    title="t2", source_uri="u2"),
    ]))
    ids = asyncio.run(backend.list_source_ids("p1"))
    assert ids == {("jira", "PLAT-1"), ("notion", "pg-9")}
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd backend && uv run pytest tests/test_rag_vertex.py::test_list_source_ids_from_corpus_files -v`
Expected: FAIL — `AttributeError: 'VertexRagBackend' object has no attribute 'list_source_ids'`.

- [ ] **Step 8: Implement on Vertex**

In `backend/app/rag/vertex.py`, add after `clear_source` (reuses `_files` + `_parse_vertex_citation`):

```python
    async def list_source_ids(self, project_id: str) -> set[tuple[str, str]]:
        """(kind, id) of every RagFile in the project's corpus. Media files share
        their parent's (kind, id) via _parse_vertex_citation, so the set dedups."""
        corpus = await self._ensure_corpus(project_id)
        out: set[tuple[str, str]] = set()
        for f in await self._files(corpus):
            citation = _parse_vertex_citation(getattr(f, "display_name", "") or "")
            if citation is not None:
                out.add((citation.source_kind, citation.source_id))
        return out
```

- [ ] **Step 9: Run the Vertex test + the full rag suite**

Run: `cd backend && uv run pytest tests/test_rag_vertex.py tests/test_rag_adapter.py tests/test_rag_types.py -q`
Expected: PASS (including any protocol-conformance check in `test_rag_types.py`, now that both adapters implement the method).

- [ ] **Step 10: Commit**

```bash
rtk git add backend/app/rag/base.py backend/app/rag/lightrag.py backend/app/rag/vertex.py backend/tests/test_rag_adapter.py backend/tests/test_rag_vertex.py
rtk git commit -m "feat(rag): list_source_ids on RagBackend (LightRAG + Vertex) for deletion reconciliation (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Jira `fetch_issue_index` + `updated_since`

**Files:**
- Modify: `backend/app/jira_client.py:56-90`
- Test: `backend/tests/test_jira_client.py`

**Interfaces:**
- Produces:
  - `async def fetch_issue_index(self, project_key: str) -> dict[str, datetime | None]` — `{issue_key: updated}` for the whole project, cheap (`fields=["updated"]`, no bodies).
  - `fetch_issues(self, project_key: str, *, updated_since: datetime | None = None)` — when set, restricts JQL to `updated >= "{updated_since:%Y/%m/%d %H:%M}"`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_jira_client.py`:

```python
def _index_two_page_handler():
    import json

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/api/3/search/jql"
        body = json.loads(request.content)
        assert body["fields"] == ["updated"]  # cheap scan: no bodies
        if body.get("nextPageToken") is None:
            return httpx.Response(200, json={
                "issues": [{"key": "PLAT-1", "fields": {"updated": "2026-06-01T10:00:00.000+0000"}}],
                "nextPageToken": "p2"})
        return httpx.Response(200, json={
            "issues": [{"key": "PLAT-2", "fields": {"updated": "2026-06-05T09:00:00.000+0000"}}],
            "isLast": True})

    return handler


def test_fetch_issue_index_maps_keys_to_updated():
    client = JiraReadClient(
        "https://m.atlassian.net/", "a@m.com", "tok", page_size=1,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(_index_two_page_handler())),
    )
    idx = asyncio.run(client.fetch_issue_index("PLAT"))
    assert set(idx) == {"PLAT-1", "PLAT-2"}
    assert idx["PLAT-2"] > idx["PLAT-1"]


def test_fetch_issues_appends_updated_since_clause():
    from datetime import datetime, timezone
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json
        seen["jql"] = json.loads(request.content)["jql"]
        return httpx.Response(200, json={"issues": [], "isLast": True})

    client = JiraReadClient(
        "https://m.atlassian.net/", "a@m.com", "tok",
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    asyncio.run(client.fetch_issues("PLAT", updated_since=datetime(2026, 6, 1, 10, 30, tzinfo=timezone.utc)))
    assert 'updated >= "2026/06/01 10:30"' in seen["jql"]
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && uv run pytest tests/test_jira_client.py::test_fetch_issue_index_maps_keys_to_updated tests/test_jira_client.py::test_fetch_issues_appends_updated_since_clause -v`
Expected: FAIL — `AttributeError: 'JiraReadClient' object has no attribute 'fetch_issue_index'` and `TypeError: fetch_issues() got an unexpected keyword argument 'updated_since'`.

- [ ] **Step 3: Implement**

In `backend/app/jira_client.py`, replace `fetch_issues` (lines 56-90) and add `fetch_issue_index` + a shared pager. Add `from datetime import datetime` to imports.

```python
    async def fetch_issues(
        self, project_key: str, *, updated_since: datetime | None = None
    ) -> list[SourceDocument]:
        # Jira Cloud enhanced search: POST /rest/api/3/search/jql, nextPageToken paging.
        jql = f'project = "{project_key}"'
        if updated_since is not None:
            # JQL `updated` is minute-granular; >= re-fetches the boundary minute
            # harmlessly (re-index is idempotent). Watermark is UTC (ScrumAgent-3wq).
            jql += f' AND updated >= "{updated_since:%Y/%m/%d %H:%M}"'
        jql += " ORDER BY created ASC"
        out: list[SourceDocument] = []
        async for issue in self._iter_issues(jql, self.FIELDS):
            out.append(self._to_doc(issue))
        return out

    async def fetch_issue_index(self, project_key: str) -> dict[str, datetime | None]:
        """Cheap full scan: {issue_key: updated} for every issue, no bodies. Backs
        the watermark and the deletion-reconciliation current-set (ScrumAgent-3wq)."""
        jql = f'project = "{project_key}" ORDER BY created ASC'
        index: dict[str, datetime | None] = {}
        async for issue in self._iter_issues(jql, ["updated"]):
            key = issue.get("key", "")
            if key:
                index[key] = parse_iso_dt((issue.get("fields", {}) or {}).get("updated"))
        return index

    async def _iter_issues(self, jql: str, fields: list[str]):
        next_token: str | None = None
        async with self._client_factory() as client:
            while True:
                payload: dict = {"jql": jql, "maxResults": self._page_size, "fields": fields}
                if next_token:
                    payload["nextPageToken"] = next_token
                resp = await client.post(
                    f"{self._site}/rest/api/3/search/jql",
                    auth=self._auth,
                    headers={"Accept": "application/json", "Content-Type": "application/json"},
                    json=payload,
                )
                resp.raise_for_status()
                body = resp.json()
                issues = body.get("issues", []) or []
                for issue in issues:
                    yield issue
                next_token = body.get("nextPageToken")
                if not next_token or not issues:
                    break
```

- [ ] **Step 4: Run the new tests + the existing suite**

Run: `cd backend && uv run pytest tests/test_jira_client.py -q`
Expected: PASS — the new tests and the existing `test_fetch_issues_paginates_and_normalizes` (now routed through `_iter_issues`).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/jira_client.py backend/tests/test_jira_client.py
rtk git commit -m "feat(jira): fetch_issue_index + updated_since filter for incremental sync (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Notion per-page `last_edited_time`

**Files:**
- Modify: `backend/app/notion_client.py:53-71`
- Test: `backend/tests/test_notion_client.py`

**Interfaces:**
- Produces: `NotionReadClient.fetch_pages` returns a `SourceDocument` per page with `updated_at` populated for **every** page (not just the root).

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_notion_client.py`, extend `_handler()` to serve the child page object, then assert the child has `updated_at`. Add the child-page branch inside `_handler` (before the final `raise`):

```python
        if path == f"/v1/pages/{CHILD}":
            return httpx.Response(200, json={
                "id": CHILD,
                "last_edited_time": "2026-06-11T08:30:00.000Z",
                "properties": {"Name": {"type": "title", "title": [{"plain_text": "Child Page"}]}},
            })
```

Then add the test:

```python
def test_every_page_has_last_edited_time():
    docs = asyncio.run(_client().fetch_pages(ROOT))
    by_id = {d.source_id: d for d in docs}
    assert by_id[ROOT].updated_at is not None
    assert by_id[CHILD].updated_at is not None      # child timestamp now fetched too
    assert by_id[CHILD].updated_at > by_id[ROOT].updated_at
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_notion_client.py::test_every_page_has_last_edited_time -v`
Expected: FAIL — `by_id[CHILD].updated_at is None` (the child's page object is never fetched today).

- [ ] **Step 3: Implement — always fetch the page object**

In `backend/app/notion_client.py`, replace `_walk_page` (lines 53-71):

```python
    async def _walk_page(self, client, page_id, known_title, depth, out) -> None:
        # Always fetch the page object: incremental sync needs every page's
        # last_edited_time, not just the root's (ScrumAgent-3wq).
        page = await self._get_page(client, page_id)
        title = known_title or (self._page_title(page) if page else page_id)
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
```

- [ ] **Step 4: Run the new test + existing suite**

Run: `cd backend && uv run pytest tests/test_notion_client.py -q`
Expected: PASS — the new test plus the existing `test_fetch_pages_walks_root_and_child` / `test_depth_cap_stops_recursion` (the root still resolves its title and body; the child now also resolves a title from its page object, matching `"Child Page"`).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/notion_client.py backend/tests/test_notion_client.py
rtk git commit -m "feat(notion): fetch last_edited_time for every page (incremental sync signal) (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Refactor `execute_run` into `_full_run` / `_finalize_status` (no behavior change)

**Files:**
- Modify: `backend/app/ingestion.py:45-118`
- Test: `backend/tests/test_ingestion_run.py` (existing tests must stay green)

**Interfaces:**
- Produces: `async def _full_run(run, *, session, project, rag, jira_reader, notion_reader, do_clear: bool)` and `def _finalize_status(run, failures: list[str], session)`. `execute_run`'s public signature is unchanged.

- [ ] **Step 1: Run the existing tests to confirm green baseline**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py -q`
Expected: PASS (8 tests).

- [ ] **Step 2: Extract the helpers (pure refactor)**

In `backend/app/ingestion.py`, replace `execute_run` (lines 45-118) with `execute_run` + the two helpers. Behavior is identical: `created` skips clear and the busy probe; `resync`/`auto` probe-then-defer, then clear, then index.

```python
def _finalize_status(run: IngestionRun, failures: list[str], session: Session) -> None:
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


async def _full_run(
    run: IngestionRun,
    *,
    session: Session,
    project: Project,
    rag,
    jira_reader,
    notion_reader,
    do_clear: bool,
) -> None:
    if do_clear:
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

    _finalize_status(run, failures, session)


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

    if run.trigger in (IngestionTrigger.resync, IngestionTrigger.auto):
        # Don't fight LightRAG's single-flight pipeline; defer (ScrumAgent-vw3).
        try:
            busy = await rag.pipeline_busy()
        except Exception:  # noqa: BLE001 — probe failure must not block the run
            busy = False
        if busy:
            run.status = IngestionStatus.deferred
            run.finished_at = _now()
            session.commit()
            return

    await _full_run(
        run,
        session=session,
        project=project,
        rag=rag,
        jira_reader=jira_reader,
        notion_reader=notion_reader,
        do_clear=run.trigger in (IngestionTrigger.resync, IngestionTrigger.auto),
    )
```

- [ ] **Step 3: Run the existing tests to verify no behavior change**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py -q`
Expected: PASS (same 8 tests, unchanged).

- [ ] **Step 4: Commit**

```bash
rtk git add backend/app/ingestion.py
rtk git commit -m "refactor(ingestion): extract _full_run/_finalize_status from execute_run (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Watermark plumbing (full runs seed `ProjectSyncState`)

**Files:**
- Modify: `backend/app/ingestion.py` (`_full_run`, `execute_run`, `run_ingestion`)
- Test: `backend/tests/test_ingestion_run.py`

**Interfaces:**
- Consumes: `ProjectSyncState` (Task 1).
- Produces: `def _get_or_create_sync_state(session, project_id: str) -> ProjectSyncState`; `_full_run` now takes `sync_state` and sets `jira_synced_until`/`notion_synced_until` to the max `updated_at` of the docs it indexed for that source.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_ingestion_run.py`, update `_doc` to carry a timestamp and add the test. Replace `_doc`:

```python
def _doc(i, updated=None):
    return SourceDocument(source_kind="jira", source_id=f"K-{i}", title="t",
                          text="b", source_uri="u", updated_at=updated)
```

Add:

```python
def test_full_run_seeds_jira_watermark():
    from datetime import datetime, timezone
    from app.models import ProjectSyncState
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project, trigger=IngestionTrigger.created)
    older = datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 5, 9, 0, tzinfo=timezone.utc)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=FakeRag(),
        jira_reader=FakeJira([_doc(1, older), _doc(2, newer)]),
    ))
    state = db.get(ProjectSyncState, project.id)
    assert state is not None
    assert state.jira_synced_until == newer
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py::test_full_run_seeds_jira_watermark -v`
Expected: FAIL — `state is None` (no watermark written yet).

- [ ] **Step 3: Implement watermark seeding**

In `backend/app/ingestion.py`, add the import and helper, thread `sync_state` through `_full_run`, and set watermarks after a successful per-source index.

Add to imports:
```python
from app.models import Project, ProjectSyncState
```
(replace the existing `from app.models import Project` line.)

Add the helper near `_to_rag`:
```python
def _get_or_create_sync_state(session: Session, project_id: str) -> ProjectSyncState:
    state = session.get(ProjectSyncState, project_id)
    if state is None:
        state = ProjectSyncState(project_id=project_id)
        session.add(state)
    return state


def _max_updated(docs) -> "datetime | None":
    stamps = [d.updated_at for d in docs if d.updated_at is not None]
    return max(stamps) if stamps else None
```

In `_full_run`, add `sync_state` to the signature and set the watermark in each source's success branch:
```python
async def _full_run(
    run: IngestionRun,
    *,
    session: Session,
    project: Project,
    rag,
    jira_reader,
    notion_reader,
    do_clear: bool,
    sync_state: ProjectSyncState,
) -> None:
```
In the jira success branch, after `run.jira_submitted = result.submitted`:
```python
            stamp = _max_updated(docs)
            if stamp is not None:
                sync_state.jira_synced_until = stamp
```
In the notion success branch, after `run.notion_submitted = result.submitted`:
```python
            stamp = _max_updated(docs)
            if stamp is not None:
                sync_state.notion_synced_until = stamp
```

In `execute_run`, fetch the state and pass it:
```python
    sync_state = _get_or_create_sync_state(session, project.id)
    await _full_run(
        run,
        session=session,
        project=project,
        rag=rag,
        jira_reader=jira_reader,
        notion_reader=notion_reader,
        do_clear=run.trigger in (IngestionTrigger.resync, IngestionTrigger.auto),
        sync_state=sync_state,
    )
```
(`_finalize_status` already calls `session.commit()`, which persists the `sync_state` row added to the session.)

- [ ] **Step 4: Run the test + full ingestion suite**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py -q`
Expected: PASS (the new watermark test + all prior tests; `_doc`'s new default keeps old calls working).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/ingestion.py backend/tests/test_ingestion_run.py
rtk git commit -m "feat(ingestion): seed ProjectSyncState watermarks on full runs (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Incremental happy path (auto + watermark → changed-only) + cold-start dispatch

**Files:**
- Modify: `backend/app/ingestion.py` (`execute_run`, add `_incremental_run`, `_incremental_jira`, `_incremental_notion`, `_needs_full`)
- Test: `backend/tests/test_ingestion_run.py`

**Interfaces:**
- Consumes: `JiraReadClient.fetch_issue_index`, `fetch_issues(updated_since=…)` (Task 4); `NotionReadClient` `updated_at` (Task 5); `RagBackend` (Task 3 not yet needed here — deletion is Task 9).
- Produces: `_needs_full(project, sync_state) -> bool`; `_incremental_run(...)`; per-source `_incremental_jira`/`_incremental_notion` that index only changed items and advance watermarks. **No deletion yet** (`jira_deleted`/`notion_deleted` stay `None` after this task).

- [ ] **Step 1: Extend the test fakes and write the failing tests**

In `backend/tests/test_ingestion_run.py`, extend the fakes to record `clear_source` and support the cheap scan + filtered fetch:

```python
class FakeRag:
    def __init__(self):
        self.cleared = []; self.indexed = []; self.cleared_sources = []
        self.source_ids = set()                      # what list_source_ids returns
    async def pipeline_busy(self): return False
    async def clear_project(self, pid): self.cleared.append(pid); return 0
    async def clear_source(self, pid, kind, sid):
        self.cleared_sources.append((kind, sid)); return 1
    async def list_source_ids(self, pid): return set(self.source_ids)
    async def index_documents(self, pid, docs):
        self.indexed.append(pid)
        return IndexResult(submitted=len(list(docs)), track_id="t")


class FakeJira:
    def __init__(self, docs, *, index=None):
        self._docs = docs
        self._index = index or {}
    async def fetch_issues(self, project_key, *, updated_since=None):
        if updated_since is None:
            return self._docs
        return [d for d in self._docs if d.updated_at and d.updated_at >= updated_since]
    async def fetch_issue_index(self, project_key):
        return dict(self._index)
```

Then the tests:

```python
def test_auto_incremental_indexes_only_changed():
    from datetime import datetime, timezone
    from app.models import ProjectSyncState
    db = _session()
    project = _project(db, with_jira=True)
    wm = datetime(2026, 6, 3, 0, 0, tzinfo=timezone.utc)
    db.add(ProjectSyncState(project_id=project.id, jira_synced_until=wm)); db.commit()

    older = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 5, 0, 0, tzinfo=timezone.utc)
    rag = FakeRag()
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        jira_reader=FakeJira(
            [_doc(1, older), _doc(2, newer)],
            index={"K-1": older, "K-2": newer},
        ),
    ))
    # incremental: no clear_project; only the changed (newer) doc re-indexed
    assert rag.cleared == []
    assert ("jira", "K-2") in rag.cleared_sources
    assert ("jira", "K-1") not in rag.cleared_sources
    assert run.jira_total == 1 and run.jira_submitted == 1
    state = db.get(ProjectSyncState, project.id)
    assert state.jira_synced_until == newer       # advanced to max over full index


def test_auto_without_watermark_falls_back_to_full():
    db = _session()
    project = _project(db, with_jira=True)        # no ProjectSyncState row
    rag = FakeRag()
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        jira_reader=FakeJira([_doc(1)], index={"K-1": None}),
    ))
    assert rag.cleared == [project.id]             # cold start = full destructive run
    assert run.status == IngestionStatus.completed
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py::test_auto_incremental_indexes_only_changed tests/test_ingestion_run.py::test_auto_without_watermark_falls_back_to_full -v`
Expected: FAIL — incremental currently routes to `_full_run`, so `rag.cleared == [project.id]` (first test asserts `[]`).

- [ ] **Step 3: Implement the incremental path**

In `backend/app/ingestion.py`, add the helpers and the `auto` dispatch.

```python
def _needs_full(project: Project, sync_state: ProjectSyncState) -> bool:
    """A configured source with no watermark forces a full pass (cold start, or a
    source added after the project was first synced)."""
    if project.jira_project_key and sync_state.jira_synced_until is None:
        return True
    if project.notion_page_id and sync_state.notion_synced_until is None:
        return True
    return False


async def _incremental_jira(run, project, rag, reader, sync_state) -> None:
    index = await reader.fetch_issue_index(project.jira_project_key)   # {key: updated}
    changed = await reader.fetch_issues(
        project.jira_project_key, updated_since=sync_state.jira_synced_until
    )
    for doc in changed:
        await rag.clear_source(project.id, "jira", doc.source_id)
    result = await rag.index_documents(project.id, _to_rag(changed))
    run.jira_total = len(changed)
    run.jira_submitted = result.submitted
    stamps = [v for v in index.values() if v is not None]
    if stamps:
        sync_state.jira_synced_until = max(stamps)


async def _incremental_notion(run, project, rag, reader, sync_state) -> None:
    docs = await reader.fetch_pages(project.notion_page_id)
    wm = sync_state.notion_synced_until
    changed = [d for d in docs if wm is None or (d.updated_at and d.updated_at >= wm)]
    for doc in changed:
        await rag.clear_source(project.id, "notion", doc.source_id)
    result = await rag.index_documents(project.id, _to_rag(changed))
    run.notion_total = len(changed)
    run.notion_submitted = result.submitted
    stamp = _max_updated(docs)
    if stamp is not None:
        sync_state.notion_synced_until = stamp


async def _incremental_run(
    run, *, session, project, rag, jira_reader, notion_reader, sync_state
) -> None:
    failures: list[str] = []
    if jira_reader is not None and project.jira_project_key:
        try:
            await _incremental_jira(run, project, rag, jira_reader, sync_state)
        except Exception as exc:  # noqa: BLE001 — isolate per source (outage guard, Task 10)
            logger.warning("jira incremental failed for %s: %s", project.id, exc)
            run.jira_total = run.jira_total or 0
            run.jira_submitted = 0
            failures.append(f"jira: {exc}")
    if notion_reader is not None and project.notion_page_id:
        try:
            await _incremental_notion(run, project, rag, notion_reader, sync_state)
        except Exception as exc:  # noqa: BLE001 — isolate per source
            logger.warning("notion incremental failed for %s: %s", project.id, exc)
            run.notion_total = run.notion_total or 0
            run.notion_submitted = 0
            failures.append(f"notion: {exc}")
    _finalize_status(run, failures, session)
```

In `execute_run`, after the busy-defer block and after fetching `sync_state`, branch `auto` to incremental when warm:
```python
    sync_state = _get_or_create_sync_state(session, project.id)

    if run.trigger == IngestionTrigger.auto and not _needs_full(project, sync_state):
        await _incremental_run(
            run, session=session, project=project, rag=rag,
            jira_reader=jira_reader, notion_reader=notion_reader, sync_state=sync_state,
        )
        return

    await _full_run(
        run,
        session=session,
        project=project,
        rag=rag,
        jira_reader=jira_reader,
        notion_reader=notion_reader,
        do_clear=run.trigger in (IngestionTrigger.resync, IngestionTrigger.auto),
        sync_state=sync_state,
    )
```

- [ ] **Step 4: Run the new tests + full ingestion suite**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py -q`
Expected: PASS (incremental + cold-start tests, and all prior tests — `resync`/`created` still go through `_full_run`).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/ingestion.py backend/tests/test_ingestion_run.py
rtk git commit -m "feat(ingestion): incremental auto path indexes only changed items (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Active deletion detection

**Files:**
- Modify: `backend/app/ingestion.py` (`_incremental_jira`, `_incremental_notion`)
- Test: `backend/tests/test_ingestion_run.py`

**Interfaces:**
- Consumes: `RagBackend.list_source_ids` (Task 3); the current-id set each source already computes (Jira `fetch_issue_index` keys; Notion walked page ids).
- Produces: each incremental source block `clear_source`s ids present in RAG but absent from the source, and records the count in `run.jira_deleted` / `run.notion_deleted`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_ingestion_run.py`:

```python
def test_auto_incremental_reconciles_deletions():
    from datetime import datetime, timezone
    from app.models import ProjectSyncState
    db = _session()
    project = _project(db, with_jira=True)
    wm = datetime(2026, 6, 3, 0, 0, tzinfo=timezone.utc)
    db.add(ProjectSyncState(project_id=project.id, jira_synced_until=wm)); db.commit()

    rag = FakeRag()
    # RAG still holds K-1 and a stale K-9; the source only knows K-1 now.
    rag.source_ids = {("jira", "K-1"), ("jira", "K-9")}
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        jira_reader=FakeJira([], index={"K-1": wm}),     # nothing changed; K-9 gone
    ))
    assert ("jira", "K-9") in rag.cleared_sources        # stale doc removed
    assert ("jira", "K-1") not in rag.cleared_sources    # still present, not touched
    assert run.jira_deleted == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py::test_auto_incremental_reconciles_deletions -v`
Expected: FAIL — `("jira", "K-9") not in rag.cleared_sources` and `run.jira_deleted is None`.

- [ ] **Step 3: Add deletion detection to both incremental source helpers**

In `backend/app/ingestion.py`, update `_incremental_jira` — insert the deletion block after indexing and before the watermark advance:

```python
async def _incremental_jira(run, project, rag, reader, sync_state) -> None:
    index = await reader.fetch_issue_index(project.jira_project_key)   # {key: updated}
    current_ids = set(index)
    changed = await reader.fetch_issues(
        project.jira_project_key, updated_since=sync_state.jira_synced_until
    )
    for doc in changed:
        await rag.clear_source(project.id, "jira", doc.source_id)
    result = await rag.index_documents(project.id, _to_rag(changed))
    run.jira_total = len(changed)
    run.jira_submitted = result.submitted
    # Reconcile deletions: drop anything in RAG the source no longer has.
    indexed = {sid for (kind, sid) in await rag.list_source_ids(project.id) if kind == "jira"}
    removed = indexed - current_ids
    for sid in removed:
        await rag.clear_source(project.id, "jira", sid)
    run.jira_deleted = len(removed)
    stamps = [v for v in index.values() if v is not None]
    if stamps:
        sync_state.jira_synced_until = max(stamps)
```

And `_incremental_notion` similarly:

```python
async def _incremental_notion(run, project, rag, reader, sync_state) -> None:
    docs = await reader.fetch_pages(project.notion_page_id)
    current_ids = {d.source_id for d in docs}
    wm = sync_state.notion_synced_until
    changed = [d for d in docs if wm is None or (d.updated_at and d.updated_at >= wm)]
    for doc in changed:
        await rag.clear_source(project.id, "notion", doc.source_id)
    result = await rag.index_documents(project.id, _to_rag(changed))
    run.notion_total = len(changed)
    run.notion_submitted = result.submitted
    indexed = {sid for (kind, sid) in await rag.list_source_ids(project.id) if kind == "notion"}
    removed = indexed - current_ids
    for sid in removed:
        await rag.clear_source(project.id, "notion", sid)
    run.notion_deleted = len(removed)
    stamp = _max_updated(docs)
    if stamp is not None:
        sync_state.notion_synced_until = stamp
```

- [ ] **Step 4: Run the new test + full ingestion suite**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py -q`
Expected: PASS (deletion test + all prior; the happy-path test from Task 8 still holds — its `rag.source_ids` is empty, so `removed` is empty and `jira_deleted == 0`).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/ingestion.py backend/tests/test_ingestion_run.py
rtk git commit -m "feat(ingestion): active deletion reconciliation in incremental sync (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Outage guard (a failed source fetch must not delete or advance)

**Files:**
- Test: `backend/tests/test_ingestion_run.py`
- Modify (only if the test exposes a gap): `backend/app/ingestion.py`

**Interfaces:**
- Consumes: the per-source `try/except` in `_incremental_run` (Task 8) and the fetch-before-mutate ordering in `_incremental_jira`/`_incremental_notion` (Tasks 8-9).

**Why this is mostly verification:** in `_incremental_jira`, `fetch_issue_index` is the first call. If it raises, `_incremental_run`'s `try/except` catches it before any `clear_source`, deletion, or watermark write runs — so the guard already holds structurally. This task proves it and tightens only if a gap is found.

- [ ] **Step 1: Write the guard test**

Add to `backend/tests/test_ingestion_run.py`:

```python
def test_incremental_jira_outage_does_not_delete_or_advance():
    from datetime import datetime, timezone
    from app.models import ProjectSyncState

    class OutageJira:
        async def fetch_issue_index(self, project_key):
            raise RagError("jira 503")
        async def fetch_issues(self, project_key, *, updated_since=None):  # pragma: no cover
            raise AssertionError("must not fetch bodies after index scan failed")

    db = _session()
    project = _project(db, with_jira=True)
    wm = datetime(2026, 6, 3, 0, 0, tzinfo=timezone.utc)
    db.add(ProjectSyncState(project_id=project.id, jira_synced_until=wm)); db.commit()

    rag = FakeRag()
    rag.source_ids = {("jira", "K-1")}      # would all look "deleted" on an empty fetch
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag, jira_reader=OutageJira(),
    ))
    assert rag.cleared_sources == []                 # nothing deleted on outage
    assert run.jira_deleted is None                  # never reached the deletion step
    assert run.status == IngestionStatus.failed      # the only source failed
    state = db.get(ProjectSyncState, project.id)
    assert state.jira_synced_until == wm             # watermark unchanged
```

- [ ] **Step 2: Run the guard test**

Run: `cd backend && uv run pytest tests/test_ingestion_run.py::test_incremental_jira_outage_does_not_delete_or_advance -v`
Expected: PASS (the structure from Tasks 8-9 already satisfies it). If it FAILS, the fix is to ensure no `clear_source`/watermark write precedes a successful `fetch_issue_index` in `_incremental_jira` — they are already ordered after it, so re-check that the `try` in `_incremental_run` wraps the entire `_incremental_jira` call (it does).

- [ ] **Step 3: Run the full backend suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS (all prior ~271+ tests plus the new ones across models, adapters, clients, and ingestion).

- [ ] **Step 4: Commit**

```bash
rtk git add backend/tests/test_ingestion_run.py
rtk git commit -m "test(ingestion): assert outage guard — failed fetch never deletes or advances watermark (ScrumAgent-3wq)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Wiki update (end of feature)

Per `CLAUDE.md`, when the feature lands: update `wiki/modules/rag.md` and `wiki/flows/backlog-ingestion.md` (auto = incremental + deletion reconciliation; resync = destructive reconcile; new `ProjectSyncState` watermark), bump `updated:`, append a dated entry atop `wiki/log.md`, and refresh `wiki/hot.md`. Not a code task — do it in the same session the work completes.

## Self-Review

**Spec coverage:**
- Trigger semantics (auto incremental / full fallback / resync destructive) → Tasks 6, 8. ✓
- `ProjectSyncState` migration-free table → Task 1. ✓
- `list_source_ids` on both adapters → Task 3. ✓
- Jira two-query (cheap index + `updated_since`) → Task 4. ✓
- Notion per-page `last_edited_time` → Task 5. ✓
- Active deletion detection → Task 9. ✓
- Outage guard → Tasks 8 (structure) + 10 (proof). ✓
- `jira_deleted`/`notion_deleted` + manual `ALTER` → Task 2. ✓
- Watermark = max over full current set; `>=` boundary → Tasks 4, 7, 8 (`fetch_issue_index` drives the Jira watermark; Notion uses all walked docs). ✓
- Cold start / source-added-later → `_needs_full`, Task 8. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; tests have real assertions. ✓

**Type consistency:** `list_source_ids -> set[tuple[str, str]]` used identically in base/LightRAG/Vertex and consumed as `(kind, sid)` in `_incremental_*`. `fetch_issue_index -> dict[str, datetime|None]` produced in Task 4, consumed in Tasks 8-9. `_full_run`/`_incremental_run` signatures match their call sites in `execute_run`. `_doc(i, updated=None)` default keeps Task-6 baseline tests valid. ✓
