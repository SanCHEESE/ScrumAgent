---
type: flow
title: "Backlog ingestion"
created: 2026-06-17
updated: 2026-06-17
tags: [flow, ingestion, rag, jira, notion, auto-sync]
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
  -> JiraReadClient / NotionReadClient
  -> RagClient.clear_project()    # on resync OR auto (LightRAG has no upsert)
  -> RagClient.index_documents()
  -> LightRAG POST /documents/texts
  -> END (IngestionRun status = completed | partial | failed)
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
8. On **re-sync** and **auto-sync**, `clear_project` deletes all documents with
   the matching `file_source` prefix before re-inserting; this is required because
   LightRAG v1.5.3 has no per-doc metadata, caller-id, or upsert support (API
   spike `ScrumAgent-m3c`) — an edited issue/page would otherwise pile up as a new
   content-hash doc, orphaning the old one.

## Periodic auto-sync (`app/auto_sync.py`)

A background `asyncio` loop, started/stopped in the FastAPI lifespan, keeps each
project's index fresh without manual action (`ScrumAgent-3mo`):

- **`select_due_projects(session, now, interval_hours)`** — pure query. A project
  is due when it has a Jira/Notion integration, `Project.auto_sync_enabled` is set,
  no run is `pending`/`running` (overlap guard), and it has either never completed
  a sync or its last `completed`/`partial` run finished ≥ `interval` ago.
- **`run_due_syncs(...)`** — creates one `IngestionRun(trigger=auto)` per due
  project and schedules it via the shared `IngestionRunner`.
- **`AutoSyncScheduler.start()/stop()`** — the thin loop seam: `run_due_syncs` then
  sleep `tick_seconds`; one failed tick logs and continues.

Cadence is a **backend setting** (`rag_auto_sync_interval_hours`, default 6h), not
per-project; each project only flips the on/off (`auto_sync_enabled`, default on).
A global `rag_auto_sync_enabled` kill-switch disables the loop. **Single-process
assumption:** multiple uvicorn workers would each run the loop — the
pending/running guard limits damage, but horizontal scaling should revisit this
(external cron / DB lock).

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
| `status` | `pending` → `running` → `completed` / `partial` / `failed` |
| `trigger` | `created`, `resync`, or `auto` |
| `created_at` / `updated_at` | timestamps |

`Project.auto_sync_enabled` (bool, default true) holds the per-project toggle.
*No Alembic yet (`ScrumAgent-soe`):* `create_all` adds the column on fresh DBs but
does not alter existing tables — existing dev DBs need a one-line `ALTER` or reset.

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
