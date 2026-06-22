---
type: flow
title: "Backlog ingestion"
created: 2026-06-17
updated: 2026-06-22
tags: [flow, ingestion, rag, jira, notion, auto-sync, incremental]
---

# Backlog ingestion

Triggered when a project is created with a Jira and/or Notion integration, on a
manual admin re-sync, or on a periodic **auto-sync** tick. Fetches the existing
backlog and indexes it into [[modules/rag]] (via LightRAG) as a background job, so
chat and agents have backlog context from day one and it stays fresh over time.

```text
START (project created OR resync requested OR auto-sync due)
  -> IngestionRunner.schedule()   # non-blocking asyncio.create_task
  -> run_ingestion()              # own DB session
  -> execute_run()                # per-source error isolation
  -> RagBackend.pipeline_busy()   # on resync OR auto: another job in flight? -> defer
  -> dispatch by trigger + watermark (ScrumAgent-3wq):
       resync | created | cold-start auto -> _full_run       (clear_project on resync/auto, reindex ALL)
       warm auto (watermark present)      -> _incremental_run (changed-only, NO clear_project)
  -> JiraReadClient / NotionReadClient    (incremental: cheap key scan + updated_since / per-page last_edited_time)
  -> per changed doc: clear_source + index_documents ; reconcile deletions: clear_source the removed
  -> advance ProjectSyncState watermark (data-driven: max updated / last_edited_time)
  -> END (IngestionRun status = completed | partial | failed | deferred)
```

## Steps

1. **Project creation** (`POST /projects`) enqueues an `IngestionRun` record
   (status `pending`, trigger `created`) and calls `IngestionRunner.trigger()`
   which wraps `run_ingestion()` in `asyncio.create_task`. The HTTP response
   returns immediately — project creation latency is unchanged.
2. **`run_ingestion`** opens its own DB session (GC-safe, decoupled from the
   request session) and calls `execute_run`.
3. **`execute_run`** iterates configured sources (Jira, Notion, whichever are
   present). Each source is fetched independently; a single-source failure sets
   the run to `partial` rather than `failed`, preserving results from successful
   sources.
4. **`JiraReadClient.fetch_issues`** paginates `POST /rest/api/3/search/jql`
   (the legacy `GET /rest/api/3/search` was removed by Atlassian — 410 Gone;
   `ScrumAgent-2vi`) using `nextPageToken`, and converts Atlassian Document
   Format (ADF) fields to plain text, producing `SourceDocument` records.
5. **`NotionReadClient.fetch_pages`** does a recursive block/page walk (depth-
   bounded), producing `SourceDocument` records.
6. Both readers share the `app/sources.py::SourceDocument` shape (text, metadata,
   source kind, source id).
7. **`RagClient.index_documents`** sends a batch `POST /documents/texts` to
   LightRAG. Documents carry a `file_source` tag:
   `"{project_id}::{source_kind}::{source_id}"` — this is the only project
   isolation available in LightRAG v1.5.3 (shared graph; see [[modules/rag]]
   for the known limitation tracked as `ScrumAgent-o39`).
8. On **re-sync** (and a **cold-start auto-sync** with no watermark yet), `clear_project`
   deletes all documents with the matching `file_source` prefix before re-inserting; this
   is required because LightRAG v1.5.3 has no per-doc metadata, caller-id, or upsert support
   (API spike `ScrumAgent-m3c`) — an edited issue/page would otherwise pile up as a new
   content-hash doc, orphaning the old one. A **warm auto-sync** no longer clears the whole
   project — it reconciles incrementally (see [Incremental auto-sync](#incremental-auto-sync-scrumagent-3wq)).
9. **Defer-on-busy** (`ScrumAgent-vw3`): before that destructive clear, `execute_run`
   probes `RagClient.pipeline_busy()`. If LightRAG is already busy with another job
   (e.g. a still-draining initial index of a large backlog), the run is marked
   `deferred` (not `failed`, no error banner) and returns without clearing — the
   scheduler retries on the next tick. This stops a resync from fighting LightRAG's
   single-flight pipeline into a `RAG_PIPELINE_MAX_WAIT_SECONDS` timeout-then-fail.
   First-time `created` ingestion never probes (the pipeline is expected idle); a
   failing probe is treated as "proceed" so a genuinely-down LightRAG still fails
   loudly.

## Periodic auto-sync (`app/auto_sync.py`)

A background `asyncio` loop, started/stopped in the FastAPI lifespan, keeps each
project's index fresh without manual action (`ScrumAgent-3mo`):

- **`select_due_projects(session, now, interval_hours)`** — pure query. A project
  is due when it has a Jira/Notion integration, `Project.auto_sync_enabled` is set,
  no run is `pending`/`running` (overlap guard), and it has either never completed
  a sync or its last `completed`/`partial` run finished ≥ `interval` ago.
- **`run_due_syncs(...)`** — creates one `IngestionRun(trigger=auto)` per due
  project and schedules it via the shared `IngestionRunner`.
- **`AutoSyncScheduler.start()/stop()`** — the thin loop seam: each tick runs
  `heal_failed_docs` then (unless it healed) `run_due_syncs`, then sleeps `tick_seconds`;
  one failed tick logs and continues.

**Auto-heal (`ScrumAgent-clo`).** Before scheduling resyncs, each tick probes LightRAG:
if the pipeline is idle and there are FAILED docs (transient embedding failures), it
calls `reprocess_failed` — re-embedding them **in place**, no wipe and no Jira/Notion
re-fetch. This is the cheap recovery the destructive resync is *not* for. `decide_heal`
bounds it with an in-memory attempt budget (`rag_heal_max_attempts`, default 3): it keeps
healing while the FAILED count drops, but gives up after N no-progress rounds so a
permanently-failing backend (e.g. no embedding access, `ScrumAgent-x0f`) can't hammer
OpenAI forever — those docs just stay visible in the health `failed` count. A tick that
heals skips resync scheduling (the pipeline is now busy). `reprocess_failed` and
`status_counts` are **instance-wide** (no project filter), so the heal is one global
operation, not per-project. Destructive `clear`+resync stays only for Jira/Notion
**edit** pickup on the 6h cadence / manual button.

Cadence is a **backend setting** (`rag_auto_sync_interval_hours`, default 6h), not
per-project; each project only flips the on/off (`auto_sync_enabled`, default on).
A global `rag_auto_sync_enabled` kill-switch disables the loop. **Single-process
assumption:** multiple uvicorn workers would each run the loop — the
pending/running guard limits damage, but horizontal scaling should revisit this
(external cron / DB lock).

## Incremental auto-sync (`ScrumAgent-3wq`)

A full clear-then-reindex on every tick re-ran LightRAG LLM entity-extraction over the whole
backlog regardless of what changed — the dominant OpenAI cost (~$100/3 days on a ~2600-doc
backlog). `auto` is now **incremental** when a watermark exists:

- **Dispatch.** `execute_run` routes `auto` to `_incremental_run` unless `_needs_full` — a
  configured source (Jira/Notion) with a `None` watermark forces a one-time full pass (cold
  start after deploy, or a source added later). `resync`/`created` stay full. The incremental
  path **never** calls `clear_project`.
- **Watermark.** `ProjectSyncState` (1:1 table, lazily created) holds a per-source data-driven
  high-watermark (`jira_synced_until` = max issue `updated`; `notion_synced_until` = max page
  `last_edited_time`), seeded on full runs and advanced over the **full** current set each
  incremental run. SQLite returns these tz-naive on a fresh-session read, so a local
  `_ensure_utc` normalizes before comparison (importing `auto_sync._as_utc` would be circular).
- **Change detection.** Jira: a cheap `fetch_issue_index` (keys + `updated`, no bodies) +
  `fetch_issues(updated_since=…)` JQL (minute-granular, `>=`) for the changed bodies only.
  Notion: the tree walk now fetches every page's `last_edited_time`; only pages `>=` the
  watermark are re-extracted. Each changed item is `clear_source`d then re-indexed (no upsert).
- **Deletion reconciliation.** New `RagBackend.list_source_ids(project_id)` returns the
  `(kind, id)` set currently indexed; anything absent from the source's current id set is
  `clear_source`d (counted in `jira_deleted` / `notion_deleted`). `current` is the full source
  id set captured *before* the changed subset, so a just-reindexed item is never spuriously
  deleted.
- **Outage guard.** Deletion + watermark advance live inside the per-source `try`, after a
  successful fetch — a failed/empty fetch (Jira 5xx, Notion token expiry) never reads as
  "everything deleted" and never advances the watermark; that source is isolated as `partial`.
- **Cost / cadence.** Interval is configurable (`rag_auto_sync_interval_hours`, config default
  6h; the shipped `.env` sets **24h** as a belt-and-braces mitigation). The first `auto` after
  deploy still does one full run per project (cold start), then every subsequent tick is cheap.

Manual **Re-sync** stays a destructive full rebuild — the reconciliation hammer if a watermark
or deletion edge ever drifts.

## Endpoints

- **`GET /projects/{id}/knowledge-base/status`** (members) — returns project-scoped
  document counts from `RagClient.status()` (now broken down `by_source_kind`),
  the last `IngestionRun`, plus `auto_sync_enabled`, `auto_sync_interval_hours`,
  and a computed `next_sync_at`. Backs the (now live) Settings → Knowledge base tab.
- **`POST /projects/{id}/knowledge-base/resync`** (admin-only) — enqueues an
  `IngestionRun(trigger=resync)` and fires it. Backs the "Sync now" button.
- **`PUT /projects/{id}/knowledge-base/auto-sync`** `{enabled}` (admin-only) —
  flips `Project.auto_sync_enabled`; the scheduler honors it on the next tick.

## Data model

`IngestionRun` (`app/models/ingestion.py`):

| field | notes |
|---|---|
| `id` | UUID primary key |
| `project_id` | FK to `Project` |
| `status` | `pending` → `running` → `completed` / `partial` / `failed` / `deferred` |
| `trigger` | `created`, `resync`, or `auto` |
| per-source counters | `jira_total`/`jira_submitted`/**`jira_deleted`** + Notion equivalents (deleted counters added in `ScrumAgent-3wq`; on an incremental run `*_total` = #changed) |
| `created_at` / `updated_at` | timestamps |

`ProjectSyncState` (1:1 with `Project`, `app/models/project.py`) holds the incremental
watermarks `jira_synced_until` / `notion_synced_until`. **No row ⇒ next `auto` does a full pass.**

`Project.auto_sync_enabled` (bool, default true) holds the per-project toggle.
*No Alembic yet (`ScrumAgent-soe`):* `create_all` creates new tables (e.g. `project_sync_state`)
on fresh DBs but does **not** alter existing ones — the `ingestion_runs.{jira,notion}_deleted`
columns ship an idempotent migration (`backend/scripts/migrate_2026_06_22_ingestion_deleted.py`)
for pre-existing DBs.

## Scope (text-only slice)

This slice is text-only. Shipped since the first slice: **periodic auto-sync**
(`ScrumAgent-bah`). Still deferred:
- Image/attachment ingestion.
- Event-driven (webhook) sync — auto-sync is interval-based.
- Chat-side retrieval against ingested backlog (`ScrumAgent-n6h`).

## Related

- [[modules/rag]] — `RagClient` adapter; `file_source` project-tagging scheme;
  shared-graph limitation (`ScrumAgent-o39`).
- [[entities/jira]] — Jira integration details.
- [[entities/notion]] — Notion integration details.
- [[domains/backend]] — `app/ingestion.py`, `app/jira_client.py`,
  `app/notion_client.py`, `app/sources.py`, `app/routers/projects.py`.
