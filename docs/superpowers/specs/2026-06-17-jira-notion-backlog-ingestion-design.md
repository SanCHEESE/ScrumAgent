# Jira/Notion Backlog Ingestion into LightRAG

Date: 2026-06-17
Status: approved direction, ready for implementation planning
Updated: 2026-06-17 (spike `ScrumAgent-m3c` resolved the LightRAG v1.5.3 API;
adapter contract / idempotency / project-scoping corrected accordingly)

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

## LightRAG v1.5.3 constraints (resolved by spike `ScrumAgent-m3c`)

The real REST API (read from the running `ghcr.io/hkuds/lightrag:v1.5.3`
OpenAPI) shapes the adapter:

- **Insert** `POST /documents/text` (`{text, file_source?, chunking?}`) and batch
  `POST /documents/texts` (`{texts[], file_sources[], chunking?}`). Both return
  `InsertResponse {status, message, track_id}`. Processing is asynchronous; the
  `track_id` lets us poll `GET /documents/track_status/{track_id}`.
- **No per-document metadata dict and no caller-supplied doc id.** The only
  provenance channel is `file_source` (a free string), surfaced later as a
  document/reference `file_path`.
- **Doc ids are content-hash derived**, so identical text re-inserts dedupe
  automatically; changed text creates a new doc. There is no upsert-by-our-id.
- **Delete** is by `doc_ids`: `DELETE /documents/delete_document`
  (`DeleteDocRequest {doc_ids[], delete_file, delete_llm_cache}`). Doc ids are
  discoverable via `POST /documents/paginated` -> `DocStatusResponse {id,
  file_path, status, ...}`.
- **Workspace is instance-level** (`LIGHTRAG_WORKSPACE` env); it is NOT a
  per-request parameter. A single LightRAG instance is one workspace with one
  shared knowledge graph.
- **`POST /query` has no project filter** parameter; query `ReferenceItem`
  carries `file_path`.
- Auth is the optional `api_key_header_value` query param (maps to
  `LIGHTRAG_API_KEY`).

### Project scoping decision

Because workspace is instance-level and there is no metadata filter, we tag every
inserted document's `file_source` with a structured, parseable prefix that begins
with the project id:

```
file_source = f"{project_id}::{source_kind}::{source_id}"
```

This gives us (a) per-project delete (`file_path` prefix match) for idempotent
re-sync, (b) per-project `status` counts (filter the paginated listing by
prefix), and (c) a forward-compatible hook for project-scoped retrieval later
(post-filter query references by `file_path` prefix in `ScrumAgent-n6h`).

**Known limitation (out of scope here, flagged for `o39`/`n6h`):** the knowledge
graph is shared across projects in a single instance, so entity/relation merging
is not project-isolated. True isolation would require per-project LightRAG
instances/workspaces (an ops/infra decision, not this ingestion slice). We choose
shared-instance + `file_source` tagging now because it is sufficient for
ingestion, reversible, and does not block scoped retrieval at the reference level.

## Goals

- On project creation, ingest the existing Jira/Notion **text** backlog into
  LightRAG, project-tagged, as a durable background job so `POST /projects`
  returns immediately.
- Provide a manual re-sync action that is idempotent (delete-by-tag, re-insert).
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
- **True per-project graph isolation** (see scoping decision above).
- Replacing the planned Rovo (`ScrumAgent-qor`) / Notion MCP (`ScrumAgent-ilz`)
  write clients. We add read-only readers behind an interface that can later
  delegate to those.
- External task broker (Celery/RQ/Redis). Against the local-first / single-VM
  posture.

## Decisions

Resolved during brainstorming + spike:

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
5. **LightRAG contract (spike m3c):** `file_source` project tagging; batch
   `POST /documents/texts`; idempotency via delete-by-tag + content-hash dedup;
   `status` via filtered paginated listing. No stable-id upsert, no query-time
   project filter (see constraints above).

## Architecture

New/changed components, all behind clear interfaces:

| Component | File | Responsibility |
|---|---|---|
| Jira read client | `app/jira_client.py` | Fetch all issues for `jira_project_key`; flatten ADF; normalize to `SourceDocument` |
| Notion read client | `app/notion_client.py` | Walk the section page + descendant pages; flatten blocks; normalize to `SourceDocument` |
| RAG adapter (write) | `app/rag.py` | `index_documents` / `clear_project` / `status` against LightRAG v1.5.3 |
| Ingestion orchestration | `app/ingestion.py` | Run a job: read sources, call the adapter, update `IngestionRun`, isolate errors |
| Run model | `app/models/ingestion.py` | `IngestionRun` persistence |
| Trigger + endpoints | `app/routers/projects.py` | Enqueue on create; `GET .../knowledge-base/status`; `POST .../knowledge-base/resync` |

### `SourceDocument` (reader output, normalized)

```
SourceDocument(
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
  recurse into `child_page` up to a max depth (configurable, default 5) to bound
  runaway trees.
- Title from the page object; `source_uri` = the page URL.

### RAG adapter contract (`app/rag.py`)

```
async def index_documents(project_id: str, documents: Sequence[RagDocument]) -> IndexResult
async def clear_project(project_id: str) -> int          # delete docs by file_source prefix
async def status(project_id: str) -> RagStatus           # counts by doc status, project-scoped
```

- `RagDocument`: `{text, source_kind, source_id, title, source_uri, updated_at}`.
  The call is already project-scoped (`project_id` argument), so the document does
  not repeat it.
- The adapter builds `file_source = f"{project_id}::{source_kind}::{source_id}"`
  and prepends a small header (`title` + `source_uri`) to `text` so those are
  carried in indexed content. It submits a single batch
  `POST /documents/texts` (texts[] + file_sources[]); on success returns
  `IndexResult {submitted: int, track_id: str | None, failed: int, errors: list}`.
  ("submitted" because LightRAG processing is async.)
- `clear_project`: pages `POST /documents/paginated`, collects `id`s whose
  `file_path` starts with `f"{project_id}::"`, deletes them via
  `DELETE /documents/delete_document` in batches; returns the count.
- `status`: same paginated listing filtered by prefix, returns
  `RagStatus {total: int, by_status: dict[str, int]}`.
- Auth: append `?api_key_header_value=<LIGHTRAG_API_KEY>` when set. Timeout uses
  `LIGHTRAG_TIMEOUT_SECONDS`. Transport/HTTP failure raises a typed `RagError`
  the worker records on the run.
- `index_meeting` and `retrieve` from `ScrumAgent-o39` are NOT implemented in this
  slice.

### Data flow

```
POST /projects
  -> validate (Google/Jira/Notion) and persist Project + ProjectCredential   [unchanged]
  -> db.commit(); db.refresh(project)                                          [projects.py:410]
  -> if jira and/or notion configured:
        create IngestionRun(status=pending, trigger=created)   (request session, committed)
        schedule run_ingestion(run_id)  (via injectable runner; NOT awaited)
  -> return ProjectOut                                                         [immediate]

run_ingestion(run_id)            (own DB session + own httpx clients)
  -> mark IngestionRun running
  -> if trigger == resync: rag.clear_project(project_id)
  -> for each configured source (jira, notion), isolated:
        read SourceDocuments (paginated)
        map -> RagDocument; rag.index_documents(project_id, docs)
        accumulate totals/submitted/failed
  -> mark completed | partial | failed; set counts, error, finished_at
```

### Endpoints (project-scoped, on existing projects router)

- `GET /projects/{project_id}/knowledge-base/status` -> latest `IngestionRun`
  (status, per-source totals/submitted, failed_count, timestamps) plus
  `rag.status(project_id)` doc counts. Members can read (`require_project_access`).
- `POST /projects/{project_id}/knowledge-base/resync` -> creates a new
  `IngestionRun(trigger=resync)` and schedules the worker. **Admin-only**
  (project admin role). Idempotent via `clear_project` + re-insert.

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
| `jira_total` / `jira_submitted` | int \| None | nullable until that source runs |
| `notion_total` / `notion_submitted` | int \| None | nullable until that source runs |
| `failed_count` | int | per-item/source failures |
| `error` | str \| None | hard-failure message |
| `errors` | `JSONType` list | optional per-item error details |
| `started_at` / `finished_at` | datetime tz \| None | |
| `created_at` / `updated_at` | datetime tz | `TimestampMixin` |

No per-document tracking table in slice 1 (re-sync is delete-by-tag + full
re-index). A tracking table is the extension point for future incremental
auto-sync.

## Idempotency

Re-sync first calls `rag.clear_project(project_id)` (delete every doc whose
`file_path` starts with `f"{project_id}::"`), then re-inserts the full backlog.
First-run ingestion relies additionally on LightRAG's content-hash dedup. This
avoids duplicate accumulation across re-syncs without needing a tracking table.

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
  failed) / `failed` (hard error or nothing submitted).

## Testing (TDD)

- **Jira reader:** `httpx.MockTransport` with canned `/search` pages (pagination)
  and ADF bodies -> assert normalization + flattening.
- **Notion reader:** `MockTransport` with block children + nested `child_page`
  (depth cap) -> assert recursion + flattening.
- **RAG adapter:** `MockTransport` LightRAG -> assert `index_documents` posts
  `/documents/texts` with correct `file_sources` (`project_id::kind::id`) and
  header-prefixed text, parses `track_id`; `clear_project` lists + deletes by
  prefix; `status` filters by prefix; api-key query param applied; `RagError` on
  HTTP failure.
- **Orchestration (`run_ingestion`):** fake readers + fake adapter -> assert
  `IngestionRun` transitions, counts, source/item error isolation, `clear_project`
  called on resync, partial vs failed.
- **`POST /projects`:** a run is enqueued when an integration is present and not
  when both are absent; response latency unchanged (worker scheduled, not
  awaited). Use an **injectable runner** dependency (mirroring
  `get_integration_validators`) so tests assert enqueue without executing real
  background work.
- **`resync` endpoint:** admin-gated; creates a new run; non-admin -> 403.
- **Compose smoke (optional):** real backend -> real LightRAG `/documents/texts`
  of a small fixture, then `status` reflects it.

## Implementation slices (ordering)

1. ~~Spike: verify LightRAG v1.5.3 insert API.~~ **Done (`ScrumAgent-m3c`)** —
   findings folded into this spec.
2. `app/rag.py` adapter (`index_documents`, `clear_project`, `status`) with
   `MockTransport` TDD.
3. Jira + Notion read clients with `MockTransport` TDD.
4. `IngestionRun` model + `run_ingestion` orchestration with fakes.
5. Trigger in `create_project` + injectable runner; `status` + `resync`
   endpoints.
6. Compose smoke; docs/wiki update.

## Risks & open questions

1. **LightRAG insert API — RESOLVED (spike m3c).** See "LightRAG v1.5.3
   constraints" above.
2. **Project graph isolation.** Shared-instance graph is a known limitation;
   scoped retrieval + true isolation are deferred to `o39`/`n6h`. `file_source`
   tagging keeps the path open.
3. **Background execution in uvicorn.** The worker must use its **own** DB session
   (not the request's) and its own httpx clients, and must capture exceptions onto
   the run row rather than dying silently. Tests use an injectable runner seam.
4. **ADF / Notion block flattening fidelity.** Aim for good-enough plain text;
   exotic node types are dropped, not errored.
5. **Large backlog cost/time.** Paginate, batch inserts, and bound Notion
   recursion depth.

## References

- `docs/superpowers/specs/2026-06-17-lightrag-multimodal-rag-design.md`
- `wiki/modules/rag.md`, `wiki/concepts/lightrag-multimodal.md`
- Beads: epic `ScrumAgent-lcw`; tasks `m3c` (spike, done), `daa` (adapter),
  `chx` (Jira reader), `an7` (Notion reader), `ce5` (model+worker),
  `6v5` (trigger+endpoints). Related: `o39`, `qor`, `ilz`, `sxm`, `89a`.
