# Jira/Notion Backlog Ingestion into LightRAG

Date: 2026-06-17
Status: approved direction, ready for implementation planning

## Context

When a project is created with a Jira and/or Notion integration, the project's
existing backlog (Jira issues with their descriptions and comments, Notion pages)
should be pulled and indexed into LightRAG so the project's chat and agents have
full context from day one — without anyone manually feeding content in.

This builds on the already-approved LightRAG direction
(`docs/superpowers/specs/2026-06-17-lightrag-multimodal-rag-design.md`) and the
ops foundation shipped in `ScrumAgent-qjh` (LightRAG + local Postgres in Compose,
backend RAG settings). It is the first feature to actually call LightRAG from the
backend, so it implements the **write half** of `app/rag.py`
(`ScrumAgent-o39`); `retrieve`/chat (`ScrumAgent-n6h`) stays out of scope here.

Today none of the moving parts exist yet:

- `backend/app/rag.py` is not implemented (settings + Compose service only).
- Jira/Notion integrations expose **credential validation only**
  (`/rest/api/3/myself`, `/v1/users/me`); there is no read client for issues or
  pages.
- `POST /projects` is fully synchronous with no post-creation hook or background
  task infrastructure.

## Goals

- On project creation, ingest the existing Jira/Notion **text** backlog into
  LightRAG, project-scoped, with citation metadata.
- Run ingestion as a durable background job so `POST /projects` returns
  immediately and progress/status is observable.
- Provide a manual re-sync action, idempotent against the first run.
- Implement the app-owned `index_documents` write contract in `app/rag.py`; keep
  LightRAG behind the adapter (no agent/router calls LightRAG directly).
- Test-drive everything with fakes (HTTP transports + fake LightRAG client).

## Non-Goals

- **Images / multimodal** (Jira attachments, Notion images). Deferred to a
  follow-up slice (VLM caption -> text). Slice 1 indexes text only.
- **Periodic auto-sync / incremental diff.** Slice 1 is one-time at creation plus
  manual re-sync (full re-index).
- **Chat retrieval** (`retrieve`) and the **full Knowledge base tab UI**
  (`ScrumAgent-sxm`). We expose a backend status endpoint; the UI is separate.
- Replacing the planned Rovo (`ScrumAgent-qor`) / Notion MCP (`ScrumAgent-ilz`)
  write clients. We add read-only readers behind an interface that can later
  delegate to those.
- External task broker (Celery/RQ/Redis). Against the local-first / single-VM
  posture.

## Decisions

Resolved during brainstorming:

1. **Trigger:** background, one-time at project creation, plus a manual re-sync
   endpoint. `POST /projects` latency is unchanged.
2. **Images:** out of slice 1; text only.
3. **Read clients:** minimal **direct REST** read clients now
   (`app/jira_client.py`, `app/notion_client.py`), following the existing
   `httpx` pattern (`google_calendar.py`, `integrations.py`). Not gated on
   Rovo/MCP.
4. **Background mechanism:** a persisted `IngestionRun` row + an **in-process
   asyncio worker** scheduled after commit. Durable status without a broker;
   fits single-VM. A run interrupted by process restart is marked accordingly and
   can be re-run (re-sync is idempotent).

## Architecture

New/changed components, all behind clear interfaces:

| Component | File | Responsibility |
|---|---|---|
| Jira read client | `app/jira_client.py` | Fetch all issues for `jira_project_key`; flatten ADF; normalize to `SourceDocument` |
| Notion read client | `app/notion_client.py` | Walk the section page + descendant pages; flatten blocks; normalize to `SourceDocument` |
| RAG adapter (write) | `app/rag.py` | `index_documents(project_id, docs)` -> LightRAG text insert with stable ids + metadata |
| Ingestion orchestration | `app/ingestion.py` | Run a job: read sources, call `rag.index_documents`, update `IngestionRun`, isolate errors |
| Run model | `app/models/ingestion.py` | `IngestionRun` persistence |
| Trigger + endpoints | `app/routers/projects.py` | Enqueue on create; `GET .../knowledge-base/status`; `POST .../knowledge-base/resync` |

### `SourceDocument` (reader output, normalized)

```
SourceDocument(
    id: str,            # stable: "jira:PROJ-123" | "notion:<page_id>"
    source_kind: str,   # "jira" | "notion"
    source_id: str,     # "PROJ-123" | "<page_id>"
    title: str,
    text: str,          # flattened plain text (summary+description+comments / blocks)
    source_uri: str,    # deep link back to the issue/page
    updated_at: datetime | None,
)
```

### Jira reader

- Auth: HTTP Basic (`jira_user_email` + decrypted `jira_api_token`), `jira_site_url`.
- JQL: `project = "<jira_project_key>" ORDER BY created ASC`, paginated via
  `startAt`/`maxResults` until `total` is exhausted. Page size configurable
  (default 100). All statuses included (full context).
- Fields: `summary`, `description`, `comment`, `status`, `issuetype`, `updated`.
- `description` and comment bodies are Atlassian Document Format (ADF) JSON; a
  helper flattens ADF nodes to plain text (good-enough: text/paragraph/list/
  heading/code; ignore layout). `text = summary + description + comments`.
- `source_uri = "<site_url>/browse/<KEY>"`.

### Notion reader

- Auth: Bearer (decrypted `notion_token`) + `Notion-Version` header (existing
  constant).
- Start from `notion_page_id`. Fetch block children
  (`GET /v1/blocks/{id}/children`, paginated), flatten `rich_text` to plain text,
  recurse into `child_page` (and optionally `child_database`) up to a max depth
  (configurable, default 5) to bound runaway trees.
- Title from the page object; `source_uri` = the page URL.

### RAG adapter write contract (`app/rag.py`)

```
async def index_documents(
    project_id: str,
    documents: Sequence[RagDocument],
) -> IndexResult
```

- `RagDocument`: `{id, text, metadata}` where `metadata` carries
  `project_id` (mandatory), `source_kind`, `source_id`, `title`, `source_uri`,
  `updated_at`.
- POSTs to the LightRAG text-insert endpoint with `workspace =
  LIGHTRAG_WORKSPACE`, attaching a **stable doc id** per document so re-sync
  replaces rather than duplicates.
- `IndexResult`: `{indexed: int, failed: int, errors: list}`.
- Orchestration maps each reader `SourceDocument` to a `RagDocument`
  (`id`/`text`/`metadata`); the adapter stays decoupled from reader-specific
  shapes so it can also serve `index_meeting`.
- Timeout/retry honor `LIGHTRAG_TIMEOUT_SECONDS`. LightRAG-unavailable raises a
  typed adapter error the worker records on the run.
- Sits alongside the planned `index_meeting`, `retrieve`, `status` from
  `ScrumAgent-o39`. This slice implements `index_documents` (and a minimal
  `status(project_id)` for counts); `retrieve` is `n6h`.

### Data flow

```
POST /projects
  -> validate (Google/Jira/Notion) and persist Project + ProjectCredential   [unchanged]
  -> db.commit(); db.refresh(project)                                          [projects.py:410]
  -> if jira and/or notion configured:
        create IngestionRun(status=pending, trigger=created)   (request session, committed)
        schedule run_ingestion(run_id)  (asyncio task; NOT awaited)
  -> return ProjectOut                                                         [immediate]

run_ingestion(run_id)            (own DB session + own httpx clients)
  -> mark IngestionRun running
  -> for each configured source (jira, notion), isolated:
        read SourceDocuments (paginated)
        rag.index_documents(project_id, docs)
        accumulate totals/indexed/failed
  -> mark completed | partial | failed; set counts, error, finished_at
```

### Endpoints (project-scoped, on existing projects router)

- `GET /projects/{project_id}/knowledge-base/status` -> latest `IngestionRun`
  (status, per-source totals/indexed, failed_count, timestamps) plus, when
  available, `rag.status(project_id)` source counts. Members can read.
- `POST /projects/{project_id}/knowledge-base/resync` -> creates a new
  `IngestionRun(trigger=resync)` and schedules the worker. **Admin-only**
  (reuses the project admin gate). Idempotent via stable doc ids.

## Data model

`IngestionRun` (`app/models/ingestion.py`), following project DB conventions
(SQLAlchemy 2.0 sync, `UUIDPKMixin`, `TimestampMixin`, `JSONType`,
`SAEnum(native_enum=False)`; bootstrapped by `init_db()`/`create_all`, no Alembic
yet — tracked by `ScrumAgent-soe`):

| Column | Type | Notes |
|---|---|---|
| `id` | str UUID PK | `UUIDPKMixin` |
| `project_id` | FK -> `projects.id` | indexed |
| `status` | enum `pending\|running\|completed\|partial\|failed` | `SAEnum(native_enum=False)` |
| `trigger` | enum `created\|resync` | |
| `jira_total` / `jira_indexed` | int | nullable until that source runs |
| `notion_total` / `notion_indexed` | int | nullable until that source runs |
| `failed_count` | int | per-item failures across sources |
| `error` | str \| None | hard-failure message |
| `errors` | `JSONType` list | optional per-item error details |
| `started_at` / `finished_at` | datetime tz \| None | |
| `created_at` / `updated_at` | datetime tz | `TimestampMixin` |

No per-document tracking table in slice 1 (re-sync is a full re-index by stable
id). A tracking table is the extension point for future incremental auto-sync.

## Idempotency

Re-sync = full re-index using stable LightRAG doc ids (`jira:KEY`,
`notion:<id>`). Re-inserting the same id must replace the prior document. If
LightRAG does not upsert on a caller-supplied id, fall back to delete-by-id then
insert, or maintain an id-tracking table — **decision deferred to planning after
verifying the LightRAG insert API** (see Risks).

## Error handling

- **Source isolation:** a Jira failure does not block Notion and vice versa.
- **Item isolation:** one bad issue/page is logged and counted in `failed_count`;
  the run continues.
- **Missing/invalid source creds:** skip that source, record the reason; do not
  fail the whole run.
- **LightRAG unavailable:** run ends `failed` with a clear `error`; the project
  stays fully usable — RAG never blocks the app (ops decision `ScrumAgent-89a`).
- **Process restart mid-run:** the run is left non-terminal; surfaced as
  interrupted and re-runnable. (Detection/cleanup is best-effort in slice 1.)
- **Final status:** `completed` (all ok) / `partial` (some items or one source
  failed) / `failed` (hard error or nothing indexed).

## Testing (TDD)

- **Jira reader:** `httpx.MockTransport` with canned `/search` pages (pagination)
  and ADF bodies -> assert normalization + flattening.
- **Notion reader:** `MockTransport` with block children + nested `child_page`
  (depth cap) -> assert recursion + flattening.
- **`rag.index_documents`:** fake LightRAG HTTP client (per `o39` approach) ->
  assert request shape, `workspace`, mandatory `project_id` in metadata, stable
  ids, `IndexResult` accounting.
- **Orchestration (`run_ingestion`):** fake readers + fake rag -> assert
  `IngestionRun` transitions, counts, source/item error isolation, partial vs
  failed.
- **`POST /projects`:** a run is enqueued when an integration is present and not
  when both are absent; response latency unchanged (worker is scheduled, not
  awaited). Use an **injectable runner** dependency (mirroring
  `get_integration_validators`) so tests assert enqueue without executing real
  background work.
- **`resync` endpoint:** admin-gated; creates a new run; non-admin -> 403.
- **Compose smoke (optional):** real backend -> real LightRAG insert of a small
  fixture, then `status` reflects it.

## Implementation slices (ordering)

1. **Spike (do first):** verify LightRAG v1.5.3 insert API — endpoint(s),
   payload, caller-supplied doc id / upsert semantics, and metadata-based
   project filtering — against the running container. Locks the `index_documents`
   contract and the idempotency approach.
2. `app/rag.py` `index_documents` (+ minimal `status`) with fake-client TDD.
3. Jira + Notion read clients with `MockTransport` TDD.
4. `IngestionRun` model + `run_ingestion` orchestration with fakes.
5. Trigger in `create_project` + injectable runner; `status` + `resync`
   endpoints.
6. Compose smoke; docs/wiki update.

## Risks & open questions

1. **LightRAG insert API (top risk).** Exact endpoint, payload, custom doc id /
   upsert behavior, and how metadata enables project-scoped retrieval are not yet
   confirmed. Resolve in the spike before coding `index_documents`.
2. **Background execution in uvicorn.** Confirm `asyncio.create_task` vs FastAPI
   `BackgroundTasks`; the worker must use its **own** DB session (not the
   request's) and its own httpx clients, and must capture exceptions onto the run
   row rather than dying silently.
3. **ADF / Notion block flattening fidelity.** Aim for good-enough plain text;
   exotic node types are dropped, not errored.
4. **Large backlog cost/time.** Paginate, stream, and bound Notion recursion
   depth; cap LightRAG insert concurrency.

## References

- `docs/superpowers/specs/2026-06-17-lightrag-multimodal-rag-design.md`
- `wiki/modules/rag.md`, `wiki/concepts/lightrag-multimodal.md`
- Beads: `ScrumAgent-o39` (RAG adapter), `ScrumAgent-qor` (Rovo/Jira),
  `ScrumAgent-ilz` (Notion MCP), `ScrumAgent-sxm` (Knowledge base tab),
  `ScrumAgent-89a` (RAG non-blocking ops decision).
