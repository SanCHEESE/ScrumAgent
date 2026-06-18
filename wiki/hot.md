---
type: meta
title: "Hot Cache"
updated: 2026-06-18
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-18. **Fixed the RAG re-sync race vs LightRAG's single-flight pipeline
(`ScrumAgent-srp`).** Re-syncs of an already-indexed project were unreliable
(partial deletes + insert 409). `RagClient` now coordinates with LightRAG's pipeline
instead of firing clear+insert blind.

## What just shipped (newest first)
- **RAG re-sync race fix** (`srp`): verified the v1.5.3 contract from the pinned
  image source — `DELETE /documents/delete_document` is async + single-flight,
  returning `200 {status:"deletion_started"}` while draining and `200
  {status:"busy"}` (NOT an HTTP error) when nothing was scheduled; `POST
  /documents/texts` returns **409** during a drain; `pipeline_status.busy` is
  coupled with `destructive_busy`. `RagClient` ([[modules/rag]]) now polls `GET
  /documents/pipeline_status` until `busy=false` before each delete batch + before
  each insert, retries `status:"busy"` deletes (no more dropped batches) and 409
  inserts, and drains after `clear_project`. New settings
  `RAG_PIPELINE_POLL_SECONDS`/`_MAX_WAIT_SECONDS`/`_BUSY_RETRIES`; injectable
  `sleep` seam for tests. 216 backend tests green (6 new). Not re-verified live.
- **RAG auto-sync + live KB tab** (`bah`): `IngestionTrigger.auto` (clears-then-
  reindexes like `resync`); `Project.auto_sync_enabled` (default true);
  `app/auto_sync.py` scheduler (`select_due_projects`, `run_due_syncs`,
  `AutoSyncScheduler` asyncio loop in lifespan, behind `rag_auto_sync_enabled`
  kill-switch; interval 6h, tick 300s); `RagClient.status` gains `by_source_kind`;
  `PUT /knowledge-base/auto-sync` (admin) + status endpoint extended
  (`auto_sync_enabled`, `auto_sync_interval_hours`, `next_sync_at`). Frontend
  `KnowledgeBaseSection` now live (real sources/health, auto-sync toggle, Sync now;
  search deferred to empty state). 209 backend tests + 16 settings e2e green.
- **Backlog ingestion** (`lcw`): `RagClient` write path, Jira/Notion read clients,
  `IngestionRun` + `execute_run`/`IngestionRunner`, create-time trigger, status +
  resync endpoints. Text-only; images/chat-retrieval still deferred (`n6h`/`o39`).
- **Review/ops foundation** (`qjh`/`89a`): LightRAG + local Postgres in Compose;
  backend/frontend startup decoupled from RAG health.

## Key Architecture Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Services: `backend` (FastAPI + DeepAgents), `frontend` (Next.js 14),
  `lightrag` (RAG service, v1.5.3, port 9621), `postgres`.
- RAG boundary: all code calls only `backend/app/rag.py` ([[modules/rag]]).
- **RAG write path live + auto-syncing.** `RagClient` = `index_documents`,
  `clear_project`, `status` (now `total` + `by_status` + `by_source_kind`).
  Project isolation = `file_source` tag `"{project_id}::{kind}::{id}"`, reference-
  level only (shared graph, `o39`). Re-sync/auto-sync = clear-by-prefix then
  reinsert (no upsert), now **coordinated with LightRAG's single-flight pipeline**
  via `pipeline_status` polling + busy/409 retries (`srp`).
  `retrieve`/`index_meeting` still planned (`n6h`/`o39`).
- **Auto-sync** ([[flows/backlog-ingestion]]): in-process asyncio loop ticks every
  `rag_auto_sync_tick_seconds` (300s), schedules `IngestionRun(trigger=auto)` for
  due projects (integration + `auto_sync_enabled` + no in-flight run + last success
  ≥ `rag_auto_sync_interval_hours` (6h) ago, or never synced). Cadence is global;
  per-project control is on/off only.
- Backend RAG/sync settings: `RAG_PROVIDER`, `LIGHTRAG_*`, plus
  `RAG_AUTO_SYNC_ENABLED`, `RAG_AUTO_SYNC_INTERVAL_HOURS`,
  `RAG_AUTO_SYNC_TICK_SECONDS`, and pipeline-coordination knobs
  `RAG_PIPELINE_POLL_SECONDS`, `RAG_PIPELINE_MAX_WAIT_SECONDS`,
  `RAG_PIPELINE_BUSY_RETRIES`.

## Local dev environment
- Backend: local uvicorn (`backend/.venv`, port 8000, no --reload); tests:
  `cd backend && .venv/bin/python -m pytest -q` (216 green).
- Frontend: `npm --prefix apps/web run dev`. Typecheck: `npm --prefix apps/web run
  typecheck`. e2e: `npx playwright test` (route-mocked; auto-boots dev server).

## Open threads
- **Multi-worker caveat:** the auto-sync loop runs per uvicorn worker; the
  pending/running guard limits damage but horizontal scaling needs an external
  cron / DB lock.
- **No Alembic (`soe`):** `Project.auto_sync_enabled` is added by `create_all` on
  fresh DBs only — existing dev/prod DBs need a one-line `ALTER`.
- RAG retrieve path (`n6h`) + `index_meeting` (`o39`) are the next RAG slices;
  search box in the KB tab waits on them. Single shared LightRAG graph (`o39`).
- Mock data still drives meeting detail, Home stats, pending updates, chat (`r0k`).
- `.gitignore` invalid leading `\` breaks `rg` in default mode (`n60`).
