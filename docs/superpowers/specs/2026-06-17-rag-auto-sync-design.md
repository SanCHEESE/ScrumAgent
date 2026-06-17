# RAG Auto-Sync + Real Knowledge Base Settings Tab

Date: 2026-06-17
Status: approved direction, ready for implementation planning

## Context

The Jira/Notion backlog ingestion epic (`ScrumAgent-lcw`) shipped the write half
of the RAG path: when a project is created with Jira and/or Notion credentials, a
background `IngestionRun` indexes the backlog into LightRAG, and an admin can
trigger a manual re-sync. Two things were explicitly deferred:

- **Periodic auto-sync** — today sync only happens on project creation
  (`trigger=created`) or manual admin re-sync (`trigger=resync`). Nothing keeps
  the index fresh as the backlog changes.
- **A real Knowledge base settings tab** — `KnowledgeBaseSection.tsx` is still
  100% mock: hardcoded source counts, a fabricated "auto, every 6h" line, a dead
  "Reindex now" button, and fake search results.

This spec covers both: a scheduled periodic re-sync with a per-project toggle, and
making the Knowledge base settings tab real (sources + health + sync controls),
with the search box deferred to an honest empty state.

### What already exists (from `ScrumAgent-lcw`)

- `backend/app/ingestion.py`: `execute_run` (testable core — on `resync` it
  clears the project then re-indexes; per-source error isolation), `run_ingestion`
  (production entry that builds clients from project credentials), and
  `IngestionRunner` (GC-safe `asyncio.create_task` seam, overridden in tests to
  assert enqueue-only).
- `backend/app/rag.py` `RagClient`: `index_documents`, `clear_project`, `status`
  (counts docs by LightRAG processing status, scoped to the `"{project_id}::"`
  `file_source` prefix). **No `retrieve`/query method.**
- `backend/app/models/ingestion.py` `IngestionRun` + `IngestionStatus`
  (`pending|running|completed|partial|failed`) and `IngestionTrigger`
  (`created|resync`).
- Router (`backend/app/routers/projects.py`): create-time trigger inside
  `create_project`; `GET /{id}/knowledge-base/status` (member-only → last run +
  RAG status); `POST /{id}/knowledge-base/resync` (admin-only → 202 + run).
- `backend/app/main.py` lifespan: configures crypto + `init_db` only. **No
  background scheduler.**

### LightRAG v1.5.3 constraints that shape this

- **No upsert; doc ids are content-hash.** Re-inserting identical text is
  idempotent (same hash), but an *edited* Jira issue / Notion page produces a
  *new* doc id and orphans the old one. So a correct periodic sync must
  **clear-then-reindex** (like `resync`), not append.
- **Single shared knowledge graph** (workspace is instance-level). Project
  scoping is reference-level only, via the `file_source` prefix
  `"{project_id}::{source_kind}::{source_id}"`. This is why real search/retrieve
  is out of scope here — project-isolated retrieval is the unsolved part of
  `ScrumAgent-o39`/`n6h`.

## Decisions (resolved with the user)

1. **Per-project toggle + fixed global cadence.** Each project turns auto-sync
   on/off; the interval is one backend default (6h), not per-project.
2. **On by default**, every 6 hours, for projects with Jira/Notion connected.
3. **Whole Knowledge base tab made real** — sources and index health become real;
   the search box is deferred to a clear "available when chat ships" empty state
   (no fake hits).
4. **Scheduler = in-process `asyncio` loop** in the FastAPI lifespan (approach A
   below).

### Scheduler approach — alternatives considered

- **A. In-process `asyncio` loop (chosen).** A background task wakes every
  `tick_seconds`, finds due projects, schedules runs through the existing
  `IngestionRunner`. Zero new dependencies; matches the existing fire-and-forget
  pattern; fits the single-VM/single-process deployment.
- **B. APScheduler.** Overkill for one periodic job; adds a dependency; still
  needs a lock under multiple workers.
- **C. External cron → internal endpoint.** Naturally single-runner, but adds an
  authenticated internal endpoint + ops wiring (Compose cron / Cloud Scheduler);
  heavier for local-first.

**Known constraint:** with multiple uvicorn workers, approach A runs one loop per
process. Mitigated by (a) the single-process deployment, (b) the DB-level
pending/running guard that prevents double-scheduling a project, and (c) a global
kill-switch setting. Revisit (C) or a DB lock if the backend ever scales
horizontally.

## Design

### Data model

- **`IngestionTrigger.auto`** — new enum value (`"auto"`). In `execute_run`, the
  clear-then-reindex branch fires for `trigger in (resync, auto)`.
- **`Project.auto_sync_enabled: bool`** — new column, `server_default` true,
  Python default `True`. Holds the per-project toggle.
  - *No Alembic yet (`ScrumAgent-soe`):* `init_db`/`create_all` adds the column on
    fresh DBs but does **not** alter existing tables. Existing dev DBs need a
    one-line `ALTER TABLE projects ADD COLUMN auto_sync_enabled BOOLEAN ...` or a
    reset. Documented in the implementation notes; the durable fix rides
    `ScrumAgent-soe`.

### Backend — scheduler (`backend/app/auto_sync.py`)

Mirrors the existing testable-core / production-seam split:

- `select_due_projects(session, *, now, interval_hours) -> list[Project]` — pure
  query. A project is **due** when all hold:
  - it has Jira or Notion configured (`jira_project_key` or `notion_page_id`),
  - `auto_sync_enabled` is true,
  - it has **no** `pending` or `running` `IngestionRun` (overlap guard), and
  - it has never had a `completed`/`partial` run, **or** the latest such run
    `finished_at` is ≥ `interval_hours` ago.
- `run_due_syncs(*, session_factory, runner, settings, now)` — opens a session,
  calls `select_due_projects`, and for each creates an
  `IngestionRun(trigger=auto, status=pending)` then `runner.schedule(run.id)`.
  Unit-tested with a fake runner: asserts which project ids enqueue and that
  disabled / not-due / in-flight / no-integration projects are skipped.
- `AutoSyncScheduler` — thin wrapper holding `settings`, `session_factory`, and a
  long-lived `IngestionRunner`. `start()` launches the loop
  (`while running: run_due_syncs(...); await asyncio.sleep(tick_seconds)`),
  `stop()` cancels it. Loop body is wrapped so one failed tick logs and continues.
  Not unit-tested (consistent with `IngestionRunner.schedule`).

Wired in `lifespan`: if `settings.rag_auto_sync_enabled`, construct the scheduler,
`await scheduler.start()`, store on `app.state`; cancel on shutdown.

### Backend — settings (`config.py`)

- `rag_auto_sync_enabled: bool = True` — global kill-switch for the loop.
- `rag_auto_sync_interval_hours: float = 6.0` — the fixed cadence.
- `rag_auto_sync_tick_seconds: float = 300.0` — how often the loop re-checks.

### Backend — `RagClient.status` extension

Extend the single pass in `_iter_project_docs` consumers to also group by source
kind (the middle segment of `"{project_id}::{kind}::{id}"`). `RagStatus` gains
`by_source_kind: dict[str, int]`. Powers the real per-source counts in the UI.

### Backend — endpoints (`routers/projects.py`)

- **`PUT /{id}/knowledge-base/auto-sync`** `{enabled: bool}` → admin-only
  (config change, consistent with resync). Sets `project.auto_sync_enabled`,
  returns the updated knowledge-base status shape.
- **`GET /{id}/knowledge-base/status`** — extend `KnowledgeBaseStatusOut` with:
  - `auto_sync_enabled: bool`
  - `auto_sync_interval_hours: float`
  - `next_sync_at: datetime | None` — computed: if enabled and a successful run
    exists, `last_finished + interval`; if enabled and never synced, `None`
    (UI shows "pending first sync"); if disabled, `None`.
  - `rag.by_source_kind` carried through `RagStatusOut`.
- **`POST /{id}/knowledge-base/resync`** — unchanged; backs the "Sync now" button.

### Frontend — real Knowledge base tab (`KnowledgeBaseSection.tsx`)

Fetch `GET /{id}/knowledge-base/status` and render real state with loading / error
/ empty handling:

- **Indexed sources** — real counts from `by_source_kind`: Jira issues, Notion
  pages. Meeting transcripts shown as `0 — indexed when meetings ship`.
- **Index health** — replace the fabricated vectors/index-size/recall/latency with
  real, available metrics: last sync time + trigger + status badge, total
  documents indexed (`rag.total`), and the `by_status` doc breakdown. Auto-sync
  state ("On · every 6h" / "Off", next sync ~time from `next_sync_at`).
- **Sync controls** — "Sync now" → resync (admin-only; shows syncing + last-run
  status including `partial`/`failed` errors); auto-sync toggle → the new PUT
  (admin-only), reusing the existing `Toggle` component. Admin-gated controls are
  hidden/disabled for non-admins and degrade gracefully on 403.
- **Search index test** — honest disabled empty state ("Search becomes available
  when chat ships"), no fake results.

Add web API-client methods: `getKnowledgeBaseStatus`, `resyncKnowledgeBase`,
`setKnowledgeBaseAutoSync`.

## Testing

- **`select_due_projects`** — table-driven over seeded projects/runs: due when
  never-synced; due when last success older than interval; not due when recent;
  skipped when disabled, when no integration, when a `pending`/`running` run
  exists.
- **`run_due_syncs`** — fake runner asserts enqueued run ids and that one
  `IngestionRun(trigger=auto)` row is created per due project; non-due/skipped
  projects create no run.
- **`execute_run`** — extend existing tests: `trigger=auto` clears before
  reindexing (same path as `resync`).
- **`RagClient.status`** — fake LightRAG returns mixed-prefix docs; assert
  `by_source_kind` grouping and that other projects' docs are excluded.
- **Endpoints** (`test_knowledge_base_api.py`) — `PUT auto-sync` admin-only (403
  for member), toggles the flag; `GET status` returns the new fields and computed
  `next_sync_at`.
- **Frontend** — component states (loading/empty/error), real counts render,
  toggle + Sync-now call the right endpoints (mocked), search shows the empty
  state. Extend `settings.spec.ts` e2e for the KB tab if low-cost.

## Out of scope (YAGNI)

Per-project interval; the retrieve/search path (`o39`/`n6h`); webhook-driven sync;
multimodal/images; true graph-level project isolation; meeting-transcript
indexing (`index_meeting`, `o39`).
