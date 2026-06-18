---
type: meta
title: "Hot Cache"
updated: 2026-06-18
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-18. Reviewed and patched the freshly shipped **user_chat RAG streaming
chat** slice. The slice is still live end-to-end: project-scoped RAG retrieval,
SSE streaming, inline citations, private resumable conversations, and Remember
write-back. Code-review fixes landed for seed auto-send, project switching,
SSE 401 handling, conversation ordering, and stale chat flow docs. Verification:
backend pytest **247 tests green**, `apps/web` typecheck green, `next build`
green, and `chat.spec.ts` **7/7 Playwright tests green**.

## What just shipped (newest first)

- **Code-review fixes for live chat** (ScrumAgent-5t3):
  - `/chat?seed=...` waits for a real active project before consuming/sending the
    seed, so Home Ask Agent links no longer get dropped during project load.
  - Active project changes cancel in-flight streams and reset `conversationIdRef`,
    active session, messages, input, and streaming state. A message sent in
    project B no longer carries project A's `conversation_id`.
  - `lib/chat-stream.ts` now mirrors the shared API client's 401 behavior:
    clear auth storage and redirect to `/login` when a chat SSE POST rejects an
    expired token.
  - `append_message()` bumps the parent `Conversation.updated_at`, so the
    history pane sorts conversations by recent activity.
  - `wiki/flows/chat.md` now matches the actual SSE contract:
    `meta {conversation_id, run_id}`, `token {delta}`, `citations {items}`,
    `done {message_id}`; Remember uses source kind `note`.

- **user_chat RAG streaming chat** (r0k / 2jb): `POST /projects/{id}/chat`
  streams meta→token*→citations→done/error. Conversations are private per user
  and project-scoped. Remember dedups via `clear_source(project_id, "note",
  message_id)` then indexes Q+A back into LightRAG.

- **RAG retrieve + LLM gateway + app-owned orchestrator**: `RagClient.retrieve`
  calls LightRAG `/query` and post-filters to `"{project_id}::"` references;
  `LlmGateway` streams OpenAI chat responses and records usage; `runtime/`
  enforces the user_chat allow-list (`rag.retrieve`, `llm`) and trace recording.

- **LightRAG single-flight fix** (srp): `RagClient` coordinates clear/index with
  `pipeline_status` polling and busy/409 retries.

## Key Architecture Facts

- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose; cloud target is one GCE VM.
- Services: `backend` (FastAPI), `frontend` (Next.js 14), `lightrag` v1.5.3,
  and PostgreSQL storage for LightRAG.
- RAG boundary: app code calls only `backend/app/rag.py`. Project isolation is
  reference-level via `file_source = "{project_id}::{kind}::{id}"`; the graph is
  still shared until `o39` true isolation work.
- `user_chat` is deterministic, not a tool loop: retrieve first; empty context
  returns the fixed knowledge-base miss message with zero LLM calls; non-empty
  context streams a grounded answer from numbered passages.
- Orchestrator is app-owned, not deepagents/langgraph. Handoff mechanism exists
  but is unused in the current user_chat slice.

## Local dev environment

- Backend tests: `cd backend && uv run pytest -q`.
- Frontend: `cd apps/web && npm run typecheck`; e2e via `npx playwright test`
  with route-mocked backend and auto-started Next dev server.
- `next lint` has been interactive/unhelpful in this environment; prefer
  typecheck/build/Playwright for current frontend gates.

## Open threads

- Live chat e2e against Docker/LightRAG/OpenAI still needs a real-stack pass.
- No live Jira/Notion handoff yet; user_chat answers only from RAG context.
- `index_meeting` is still planned; meeting artifacts are not indexed yet.
- Existing dev/prod DBs may need manual schema migration because Alembic is not
  present.
- Some shell screens still use mock data: meeting detail, pending updates, trace
  UI follow-ups.
