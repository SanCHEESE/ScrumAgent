---
type: meta
title: "Hot Cache"
updated: 2026-06-18
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-18. **Added a periodic RAG auto-heal** (`ScrumAgent-clo`), built in response to
the user's pushback on the `vw3` recovery plan: *why a (clean) resync at all — why not
just re-sync the failed issues in place and not report an error?* Correct instinct.
LightRAG's `POST /documents/reprocess_failed` re-embeds only FAILED docs **in place** (no
wipe, no Jira/Notion re-fetch) — the cheap recovery a destructive resync is not for. The
auto-sync scheduler now does this automatically. TDD: **269 backend tests green** (+17).

## What just shipped (newest first)

- **RAG auto-heal** (ScrumAgent-clo): each auto-sync tick, when the LightRAG pipeline is
  idle and the **instance-wide** FAILED count (`RagClient.failed_count()`) is > 0, the
  scheduler calls `RagClient.reprocess_failed()` (re-embed in place). A tick that heals
  skips resync scheduling (pipeline now busy). `decide_heal` (pure) bounds it: keep
  healing while FAILED drops, give up after `rag_heal_max_attempts` (default 3)
  no-progress rounds so a permanently-failing backend (e.g. `x0f` no-access) can't hammer
  OpenAI forever — those docs stay visible in the health `failed` count. `heal_failed_docs`
  swallows `RagError` (a blip can't kill the tick). Scheduler takes an injected `rag`
  collaborator (None ⇒ heal off). `reprocess_failed`/`status_counts` are instance-wide.
  Destructive resync stays only for Jira/Notion **edit** pickup. See [[modules/rag]],
  [[flows/backlog-ingestion]]; spec `docs/superpowers/specs/2026-06-18-rag-auto-heal-design.md`.

- **RAG sync hardening** (ScrumAgent-vw3): `RagClient.pipeline_busy()` probe +
  defer-on-busy in `execute_run` (`IngestionStatus.deferred`, no scary "Last sync error"
  / scheduler retry-storm when an index is in flight); LightRAG compose throughput knobs
  `LIGHTRAG_EMBEDDING_FUNC_MAX_ASYNC=2` / `LIGHTRAG_EMBEDDING_TIMEOUT=180` /
  `LIGHTRAG_MAX_PARALLEL_INSERT=2`. Root cause was embedding overload (8-way concurrency
  on a 2626-doc backlog tripping the 60s worker timeout → 493 FAILED), **not** `x0f`.

- **Code-review fixes for live chat** (ScrumAgent-5t3): `/chat?seed=...` waits for an
  active project; project switch cancels in-flight streams + resets conversation state;
  `chat-stream.ts` mirrors the 401-redirect; `append_message()` bumps parent
  `updated_at`; `wiki/flows/chat.md` matches the real SSE contract.

- **user_chat RAG streaming chat** (r0k / 2jb): `POST /projects/{id}/chat` streams
  meta→token*→citations→done/error; private per-user, project-scoped; Remember dedups via
  `clear_source` then re-indexes Q+A.

- **RAG retrieve + LLM gateway + app-owned orchestrator**: `RagClient.retrieve` →
  LightRAG `/query`, post-filtered to `"{project_id}::"` references; `LlmGateway` streams
  OpenAI; `runtime/` enforces the user_chat allow-list.

## Key Architecture Facts

- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose;
  cloud target is one GCE VM.
- Services: `backend` (FastAPI; built image — **no source mount**, so code changes need
  `docker compose up -d --build backend` to deploy), `frontend` (Next.js 14, bind-mounted),
  `lightrag` v1.5.3, and PostgreSQL for LightRAG storage.
- RAG boundary: app code calls only `backend/app/rag.py`. Project isolation is
  reference-level via `file_source = "{project_id}::{kind}::{id}"`; the graph is shared
  until `o39` true isolation. **`reprocess_failed`/`status_counts` are instance-wide** (no
  project filter) → the auto-heal is one global op.
- Backlog ingestion: `execute_run` clears-then-reindexes on resync/auto (LightRAG has no
  upsert), defers on a busy pipeline; the scheduler now also auto-heals FAILED docs.
- `user_chat` is deterministic: retrieve first; empty context → fixed miss message, zero
  LLM calls; non-empty → grounded answer from numbered passages.

## Local dev environment

- Backend tests: `cd backend && uv run pytest -q` (**269 green**). No ruff in the uv env.
- Frontend: `cd apps/web && npm run typecheck`; e2e via `npx playwright test`.
- `next lint` is interactive/unhelpful here; prefer typecheck/build/Playwright.

## Open threads

- Auto-heal is built + tested; deploy needs a `--build` of the backend container (built
  image, no source mount). Heal is a no-op while live FAILED count is 0.
- Live chat e2e against Docker/LightRAG/OpenAI still needs a real-stack pass.
- No live Jira/Notion handoff yet; `index_meeting` still planned.
- Alembic absent — existing dev/prod DBs may need manual schema migration.
- OpenAI key was once printed to a transcript this session — rotate if that transcript
  left the machine.
