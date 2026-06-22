---
type: meta
title: "Hot Cache"
updated: 2026-06-22
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-22. **Incremental RAG auto-sync** shipped (`ScrumAgent-3wq`), in response to a
~$100/3-day OpenAI bill. Root cause: every `auto` tick was a **destructive full
re-index** of the whole backlog, re-running LightRAG LLM entity-extraction over
everything regardless of what changed — "tasks rarely change" never helped because the
run never looked at what changed. Built subagent-driven over **10 TDD tasks**; **303
backend tests green**; opus whole-branch review = merge-ready (no Critical/Important);
merged fast-forward into `feat/rag-backend-protocol` (local, not pushed).

## What just shipped (newest first)

- **RAG cost-tuning** (ScrumAgent-50y): confirmed `gpt-5-mini`/`gpt-5-nano` are retired
  (404 on the key) — only `gpt-5.4` / `gpt-5.4-mini` / `gpt-5.4-nano` exist; kept
  `gpt-5.4-mini` for ingestion (nano ~3.7× cheaper but degrades graph extraction). OpenAI
  prompt-caching of the static extraction prefix is automatic; pinned LightRAG
  `ENABLE_LLM_CACHE=true` in compose (`env.example` ships it `false`) so a fresh deploy
  can't disable caching. Behaviour-neutral; applies on next `up -d --build`. Pushed to
  `main` (`8771f6e`, `de9bfaa`). See [[domains/deployment]].

- **Incremental auto-sync** (ScrumAgent-3wq): `auto` now re-extracts only changed items
  and reconciles deletions. `execute_run` routes `auto` → `_incremental_run` unless
  `_needs_full` (a configured source with no watermark → one-time full pass: cold start
  after deploy, or a source added later); `resync`/`created` stay full; **incremental
  never calls `clear_project`**. New `ProjectSyncState` (1:1 table, migration-free) holds
  data-driven per-source watermarks. Jira change = cheap `fetch_issue_index` +
  `updated_since` JQL; Notion walk now reads every page's `last_edited_time`. Deletions =
  new `RagBackend.list_source_ids` (both adapters), indexed − current → `clear_source`,
  counted in new `IngestionRun.jira_deleted`/`notion_deleted` (manual `ALTER` migration).
  **Outage guard**: deletion + watermark advance live inside the per-source `try` after a
  successful fetch, so a transient source failure never wipes the index. SQLite returns the
  watermark tz-naive → local `_ensure_utc` normalizes (importing `auto_sync._as_utc` is
  circular). Mitigation: `.env` widened `RAG_AUTO_SYNC_INTERVAL_HOURS` 6h→24h. Deferred
  cosmetic cleanups: `ScrumAgent-ezp`. See [[flows/backlog-ingestion]], [[modules/rag]].

- **RagBackend protocol + Vertex adapter** (ScrumAgent-65g): `app/rag/` is a package —
  `base.py` (protocol + dataclasses), `lightrag.py`, `vertex.py`, `factory.py`. Two
  interchangeable backends (`rag_provider` config). **Done but NOT yet merged to main /
  pushed** — `feat/rag-backend-protocol` carries 65g + 3wq.

- **RAG auto-heal** (ScrumAgent-clo): each auto tick, idle pipeline + instance-wide FAILED
  count > 0 → `reprocess_failed` (re-embed in place). Bounded by `decide_heal`.

## Key Architecture Facts

- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose;
  cloud target one GCE VM. App DB is **SQLite** (`DateTime(timezone=True)` reads back
  tz-naive — hence `_as_utc`/`_ensure_utc`). LightRAG storage is PostgreSQL.
- RAG boundary: app code calls only `app/rag/` adapters (9 protocol methods). LightRAG
  project isolation is reference-level via `file_source = "{project_id}::{kind}::{id}"`;
  shared graph until `o39`. Vertex isolation is native (corpus per project).
- Ingestion: `execute_run` dispatches full (`_full_run`, clear-then-reindex) vs incremental
  (`_incremental_run`, changed-only + deletion reconcile). `resync` = destructive hammer.
- No Alembic: new tables auto-create via `create_all`; column adds need a manual `ALTER`
  script (`backend/scripts/migrate_*.py`).

## Local dev environment

- Backend tests: `cd backend && uv run pytest -q` (**303 green**). No ruff in the uv env.
  Note: `pytest -q`'s summary line is swallowed by pipes here — trust `exit=0` + all-dots.
- Frontend: `cd apps/web && npm run typecheck`; e2e `npx playwright test`.

## Open threads

- **Integration pending (user's call):** `feat/rag-backend-protocol` has 65g + 3wq, both
  done but unmerged to `main` and unpushed. Next: 65g+3wq → main, then push.
- Deploy needs a backend container `--build` (built image, no source mount); run the
  `ingestion_runs.{jira,notion}_deleted` migration on existing DBs. **First `auto` after
  deploy does one full run per project (cold start), then incremental** — runbook heads-up.
- Live chat / live Jira+Notion handoff still need a real-stack pass; `index_meeting` planned.
- OpenAI key was once printed to a transcript — rotate if that transcript left the machine.
