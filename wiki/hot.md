---
type: meta
title: "Hot Cache"
updated: 2026-06-18
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-18. **Shipped the user_chat RAG streaming chat slice end-to-end**
(ScrumAgent-r0k / 2jb). Project-scoped, RAG-grounded chat with SSE streaming,
inline citations, private resumable conversations, and a "Remember" write-back
into the knowledge base. 245 backend unit tests green. Live e2e pending
(`ScrumAgent-uzx`).

## What just shipped (newest first)

- **user_chat RAG streaming chat** (r0k / 2jb): Full end-to-end chat slice.
  - `rag.retrieve(project_id, question, k)` — LightRAG `/query` with
    `only_need_context`, post-filtered to `"{project_id}::"` prefix (anti-leakage
    + anti-hallucination). `rag.clear_source(project_id, kind, id)` for Remember
    dedup.
  - `LlmGateway` (llm.py) — streaming wrapper over `langchain_openai.ChatOpenAI`;
    model = `OPENAI_CHAT_MODEL or OPENAI_MODEL`; writes one `LlmUsage` row per
    call. New setting `openai_chat_model`.
  - `backend/app/runtime/` — app-owned orchestrator (NOT deepagents/langgraph):
    `contracts.py` (AgentName, RunMode, RunContext, HandoffTarget, CAPABILITIES
    allow-list) + `orchestrator.py` (Orchestrator, GatedServices proxy,
    CapabilityError, trace recording, mediated handoff — unused this slice).
  - `repositories/trace.py` — `start_run` / `record_step` / `finish_run` /
    `get_run` / `list_steps` live.
  - `agents/user_chat.py` — DETERMINISTIC pipeline: retrieve ALWAYS first; empty
    context → fixed "not in knowledge base" message, ZERO LLM calls; else grounded
    prompt (numbered passages + last 10 history msgs) → stream → citations.
  - `routers/chat.py` — `POST /projects/{id}/chat` (SSE: meta→token\*→citations→
    done/error), conversations list + messages, Remember endpoint. JWT +
    `require_project_access` + per-user ownership.
  - `Conversation.project_id` FK (NOT NULL, indexed) — conversations project-scoped
    and private.
  - Frontend: real SSE chat (`ChatScreen.tsx`), Remember button (`ChatMessage.tsx`),
    resumable history, `lib/chat-stream.ts`, chat methods in `lib/api.ts`. tsc clean.

- **RAG re-sync race fix** (srp, 2026-06-18): `RagClient` now coordinates with
  LightRAG's single-flight pipeline via `pipeline_status` polling + busy/409
  retries. 216 backend tests green.

- **RAG auto-sync + live KB tab** (bah): `IngestionTrigger.auto`,
  `Project.auto_sync_enabled`, `AutoSyncScheduler` asyncio loop (6h cadence).
  Knowledge base settings tab fully live (sources, health, toggle, Sync now).

- **Backlog ingestion** (lcw): `RagClient` write path, Jira/Notion read clients,
  `IngestionRun` + runner, create-time trigger.

## Key Architecture Facts

- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Services: `backend` (FastAPI), `frontend` (Next.js 14), `lightrag` (v1.5.3,
  port 9621), `postgres`.
- RAG boundary: all code calls only `backend/app/rag.py`.
- **RAG: write + retrieve now live.** `RagClient` = `index_documents`,
  `clear_project`, `status`, `retrieve`, `clear_source`. Project isolation =
  `file_source` tag `"{project_id}::{kind}::{id}"`, reference-level only (shared
  graph, `o39`). `index_meeting` still planned (`o39`).
- **Orchestrator is app-owned, NOT deepagents/langgraph.** Deterministic pipeline
  for user_chat. Handoff mechanism wired but unused until real `jira_notion`
  handoff lands. ADR: `decisions/2026-06-18-app-owned-orchestrator-not-deepagents-lib`.
- **Chat is live.** SSE event contract: meta→token\*→citations→done/error.
  Conversations private (per user) and project-scoped. Remember writes Q+A back
  into the index (clear_source dedup + index_documents).
- **Anti-hallucination guarantee by construction:** `user_chat` pipeline is
  deterministic — empty context → zero LLM calls; no answer generated outside
  retrieved passages.

## Local dev environment

- Backend: local uvicorn (`backend/.venv`, port 8000); tests:
  `cd backend && .venv/bin/python -m pytest -q` (245 green).
- Frontend: `npm --prefix apps/web run dev`. Typecheck: `npm --prefix apps/web run
  typecheck`. e2e: `npx playwright test` (route-mocked; auto-boots dev server).

## Open threads

- **Live e2e (`ScrumAgent-uzx`):** chat not yet tested against Docker/LightRAG/
  OpenAI stack. Must confirm SSE streaming + RAG retrieve + OpenAI chat model work
  end-to-end.
- **No live Jira/Notion handoff:** orchestrator handoff mechanism exists but
  `user_chat` only uses RAG context this slice.
- **`index_meeting` (`o39`):** meeting artifacts not yet indexed; knowledge base
  is Jira/Notion-only.
- **Shared LightRAG graph (`o39`):** project isolation is reference-level only
  (file_source prefix). True graph isolation is deferred.
- **No Alembic (`soe`):** `Conversation.project_id` and other new columns added by
  `create_all` only — existing dev/prod DBs may need `ALTER TABLE`.
- **Multi-worker caveat:** auto-sync loop runs per uvicorn worker; horizontal
  scaling needs an external cron / DB lock.
- **Mock data** still drives meeting detail, pending updates, trace UI (`r0k`
  follow-ups).
