# Telecom Scrum Agent — MVP v2 Implementation Plan

> **For agentic workers:** REQUIRED STARTING SKILL: use `superpowers:using-superpowers` before any work in a session.
>
> **Required execution skill:** use `superpowers:subagent-driven-development` when splitting independent tasks, or `superpowers:executing-plans` when executing this plan inline.
>
> **Required engineering discipline:** use `superpowers:test-driven-development` for every feature, bug fix, refactor, and behavior change. No production code without a failing test first.
>
> **Tracking rule:** use `bd` for execution tracking. Do not track progress by editing checkboxes in this file.

**Goal:** Build the local MVP v2 of Telecom Scrum Agent with a DeepAgents runtime, OpenAI as the only LLM provider, Google Calendar/Meet ingest, a shared RAG knowledge base, Jira/Notion MCP integration, and a Next.js UI for chat, meetings, updates, settings, and trace review.

**Architecture:** Two Docker Compose services plus a shared `./data` volume. The `backend` service is a single Python container that runs FastAPI, background jobs, DeepAgents orchestration, all three agents, SQLite, RAG, MCP adapters, and trace persistence. The `frontend` service is a Next.js App Router app that talks only to the backend through typed HTTP and SSE helpers.

**Tech Stack:**
- Backend: FastAPI, Uvicorn, SQLAlchemy, SQLite, OpenAI via `langchain-openai`, DeepAgents runtime, MCP Python client, `langchain-mcp-adapters`, RAG-Anything, Google auth and API clients, python-jose, pytest.
- Frontend: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Vitest or Jest, Playwright.
- Runtime: Docker Compose, local `./data/db`, `./data/rag`, `./data/keys`.

---

## 1. Non-Negotiable Workflow

1. Run `bd prime` at session start.
2. Run `bd ready --json` and inspect active work.
3. Create or claim the exact bead issue before implementation:

```bash
bd create --title="Implement <task name>" --description="<task scope and acceptance>" --type=task --priority=2 --json
bd update <issue-id> --claim --json
```

4. Use `superpowers:using-superpowers`.
5. Use `superpowers:test-driven-development` before changing code.
6. For every behavior change:
   1. Write the smallest failing test.
   2. Run the exact test and confirm it fails for the expected reason.
   3. Implement the smallest production change.
   4. Run the exact test and confirm it passes.
   5. Run the relevant broader test command.
   6. Refactor only while tests stay green.
   7. Commit the completed slice.
7. At session end:

```bash
git status
git add <changed-files>
git commit -m "<type>: <summary>"
git pull --rebase
bd dolt push
git push
git status
```

The final `git status` must show the branch is up to date with origin. If network push fails, record the exact failure and retry after resolving credentials or connectivity.

---

## 2. Target File Structure

```text
telecom-scrum-agent/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── auth.py
│   │   ├── deps.py
│   │   ├── llm.py
│   │   ├── rag.py
│   │   ├── calendar_sync.py
│   │   ├── mcp_clients.py
│   │   ├── trace_store.py
│   │   ├── runtime/
│   │   │   ├── __init__.py
│   │   │   ├── contracts.py
│   │   │   └── orchestrator.py
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   ├── meeting_participation.py
│   │   │   ├── user_chat.py
│   │   │   └── jira_notion.py
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth.py
│   │       ├── chat.py
│   │       ├── meetings.py
│   │       ├── updates.py
│   │       ├── settings.py
│   │       └── trace.py
│   └── tests/
│       ├── conftest.py
│       ├── test_config.py
│       ├── test_models.py
│       ├── test_auth.py
│       ├── test_llm.py
│       ├── test_rag.py
│       ├── test_calendar_sync.py
│       ├── test_runtime.py
│       ├── test_meeting_participation.py
│       ├── test_user_chat.py
│       ├── test_jira_notion.py
│       ├── test_mcp_clients.py
│       └── test_api_smoke.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── auth/callback/page.tsx
│   │   │   ├── chat/page.tsx
│   │   │   ├── meetings/page.tsx
│   │   │   ├── meetings/[id]/page.tsx
│   │   │   ├── updates/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── trace/page.tsx
│   │   ├── components/
│   │   │   ├── AppShell.tsx
│   │   │   ├── AuthGuard.tsx
│   │   │   ├── Nav.tsx
│   │   │   └── StatusBadge.tsx
│   │   └── lib/
│   │       ├── api.ts
│   │       ├── auth.ts
│   │       └── types.ts
│   └── tests/
│       ├── api.test.ts
│       ├── auth.test.ts
│       └── smoke.spec.ts
└── data/
    ├── db/
    ├── rag/
    └── keys/
```

Rules:
- Only the `backend` service mounts `./data`.
- The frontend never talks to agents directly.
- There is no separate agents container and no agent-specific public port.

---

## 3. Environment Contract

Create `.env.example` with these values:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_DOMAIN=municorn.com

# Google service account for Calendar / Meet domain-wide delegation
GOOGLE_WORKSPACE_SUBJECT=
SA_KEY_PATH=/data/keys/sa_key.json

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

# App
SECRET_KEY=change-me-in-production
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

# Storage
DATABASE_URL=sqlite:////data/db/dev.db
RAG_STORAGE_PATH=/data/rag

# MCP / integrations
ATLASSIAN_MCP_URL=https://mcp.atlassian.com/v1/sse
ATLASSIAN_API_TOKEN=
NOTION_MCP_URL=https://mcp.notion.com/v1/sse
NOTION_TOKEN=
```

Rules:
- `ANTHROPIC_API_KEY` is not used in MVP v2.
- The backend must fail fast if `OPENAI_API_KEY` is missing when an LLM-backed capability is invoked.
- `OPENAI_MODEL` must be configurable and tests must not depend on live OpenAI requests.

---

## 4. DeepAgents Runtime Design

### 4.1 Runtime Contracts And Shared Services

`backend/app/runtime/contracts.py` owns the backend run contract:

- `RunMode = Literal["meeting_processing", "chat"]`
- `AgentName = Literal["meeting_participation", "user_chat", "jira_notion"]`
- `HandoffTarget = Literal["meeting_participation", "user_chat", "jira_notion", "END"]`
- `RunContext` contains:
  - `run_id`
  - `mode`
  - `user_id`
  - `meeting_id`
  - `messages`
  - `meeting_record`
  - `meeting_analysis`
  - `retrieval_results`
  - `proposed_updates`
  - `requires_jira_notion_context`
  - `final_answer`
  - `trace_events`

`backend/app/runtime/orchestrator.py` owns:
- run creation and finalization,
- handoff policy between agents,
- trace event emission,
- shared service injection,
- controlled failure behavior for partial external outages.

Shared services are provided once per backend process:
- SQLite session factory,
- OpenAI chat model factory,
- Google Calendar and Meet adapter,
- RAG service,
- MCP tool registry,
- trace store.

### 4.2 Agent Responsibilities And Tool Boundaries

#### `meeting_participation`

Responsibility:
- sync Calendar events with Meet links,
- fetch transcript, notes, and meeting metadata,
- normalize artifacts into app-owned meeting records,
- call OpenAI to produce summary, action items, decisions, and blockers,
- index meeting artifacts and analysis into RAG.

Allowed tools:
- Google Calendar and Meet adapter,
- OpenAI analysis helpers,
- RAG write interface,
- trace store.

Forbidden:
- direct Jira or Notion MCP access,
- final user-chat response generation.

#### `user_chat`

Responsibility:
- handle interactive chat requests,
- retrieve context from RAG,
- decide whether fresh Jira or Notion context is required,
- synthesize final cited answers,
- stream structured SSE events back to the UI.

Allowed tools:
- OpenAI chat helpers,
- RAG read interface,
- trace store,
- runtime handoff to `jira_notion`.

Forbidden:
- direct Google Calendar or Meet access,
- direct Jira or Notion writes.

#### `jira_notion`

Responsibility:
- own all Jira and Notion MCP reads,
- generate staged Jira and Notion updates from meeting outputs,
- create or append meeting notes in Notion,
- apply approved changes,
- normalize MCP tool outputs into app-owned result objects.

Allowed tools:
- Atlassian MCP adapter,
- Notion MCP adapter,
- approval-policy checker,
- trace store.

Forbidden:
- Google Calendar or Meet access,
- final chat answer composition.

### 4.3 Meeting Processing Workflow

Meeting processing is deterministic in MVP v2:

```text
START
  -> meeting_participation
  -> optional jira_notion
  -> END
```

Rules:
- `meeting_participation` always runs first.
- `jira_notion` runs only when meeting analysis references Jira or Notion objects, or when staged updates or meeting-note actions are required.
- Every handoff and decision is persisted into the trace store.

### 4.4 Chat Workflow

Chat is user-led and may require live Jira or Notion context:

```text
START
  -> user_chat
  -> optional jira_notion
  -> user_chat
  -> END
```

Rules:
- `user_chat` always owns the final response.
- `jira_notion` is a contextual integration agent, not a user-facing answer agent.
- Chat must return citations with source type and source identifier.

### 4.5 Human-In-The-Loop Rules

Automatic without approval:
- create or append meeting notes in the configured Notion parent,
- add local links between meetings and referenced Jira or Notion objects,
- add local `mentioned-in-meeting` metadata,
- persist staged recommendations for later review.

Require explicit approval:
- Jira assignee, status, due date, estimate, priority, description,
- Notion edits beyond appending meeting notes,
- Jira issue creation when the user did not explicitly request it,
- any MCP action that mutates external systems in a non-idempotent way.

Approval is enforced only inside `jira_notion`. Neither `meeting_participation` nor `user_chat` may perform risky external writes.

---

## 5. Iterative Implementation Plan

Each task must start with failing tests and end with targeted verification.

### Task 1: Project Scaffold And Config

**Files:**
- Create `docker-compose.yml`
- Create `.env.example`
- Create `backend/Dockerfile`
- Create `backend/requirements.txt`
- Create `backend/pytest.ini`
- Create `backend/app/main.py`
- Create `backend/app/config.py`
- Create `backend/tests/test_config.py`
- Create `frontend/Dockerfile`
- Create `frontend/package.json`
- Create `frontend/src/app/layout.tsx`
- Create `frontend/src/app/page.tsx`

**Verification:**
- `cd backend && pytest tests/test_config.py -v`
- `docker compose config`

**Acceptance:**
- Backend exposes port `8000`.
- Frontend exposes port `3000`.
- `./data` is mounted into backend only.
- No Anthropic dependency or environment variable is required.

### Task 2: SQLite Models And Trace Tables

**Files:**
- Create `backend/app/database.py`
- Create `backend/app/models.py`
- Create `backend/tests/conftest.py`
- Create `backend/tests/test_models.py`
- Modify `backend/app/main.py`

**Verification:**
- `cd backend && pytest tests/test_models.py -v`

**Acceptance:**
- Runtime DB uses `DATABASE_URL`.
- Tests use in-memory SQLite.
- Trace tables exist before any agent execution.

### Task 3: Auth And Domain Restriction

**Files:**
- Create `backend/app/auth.py`
- Create `backend/app/deps.py`
- Create `backend/app/routers/auth.py`
- Create `backend/tests/test_auth.py`
- Modify `backend/app/main.py`

**Verification:**
- `cd backend && pytest tests/test_auth.py -v`

**Acceptance:**
- Only `ALLOWED_DOMAIN` users can log in.
- OAuth callback redirects to `FRONTEND_URL/auth/callback?token=<jwt>`.
- JWT includes `sub`, `email`, `name`, `picture`, and `exp`.

### Task 4: OpenAI LLM Gateway

**Files:**
- Create `backend/app/llm.py`
- Create `backend/tests/test_llm.py`
- Modify `backend/requirements.txt`

**Verification:**
- `cd backend && pytest tests/test_llm.py -v`

**Acceptance:**
- `get_chat_model(settings)` uses `OPENAI_MODEL`.
- Missing `OPENAI_API_KEY` raises a clear runtime error.
- Tests fake the LLM and never call OpenAI.

### Task 5: DeepAgents Runtime Contracts, Orchestrator, And Trace Store

**Files:**
- Create `backend/app/runtime/__init__.py`
- Create `backend/app/runtime/contracts.py`
- Create `backend/app/runtime/orchestrator.py`
- Create `backend/app/trace_store.py`
- Create `backend/tests/test_runtime.py`
- Modify `backend/app/models.py`

**Verification:**
- `cd backend && pytest tests/test_runtime.py -v`

**Acceptance:**
- The runtime supports only the three named agents.
- Meeting runs and chat runs share one contract shape.
- Every agent handoff and result is recorded to the trace store.

### Task 6: Google Calendar And Meet Adapter

**Files:**
- Create `backend/app/calendar_sync.py`
- Create `backend/tests/test_calendar_sync.py`
- Modify `backend/app/models.py`

**Verification:**
- `cd backend && pytest tests/test_calendar_sync.py -v`

**Acceptance:**
- Events without Meet links are ignored.
- Duplicate calendar events are skipped safely.
- Missing transcript becomes `no_transcript`, not a crash.

### Task 7: RAG Service

**Files:**
- Create `backend/app/rag.py`
- Create `backend/tests/test_rag.py`
- Modify `backend/requirements.txt`

**Verification:**
- `cd backend && pytest tests/test_rag.py -v`

**Acceptance:**
- The app exposes a small RAG interface instead of raw library calls everywhere.
- Indexed entries include `source_type`, `source_id`, `meeting_id`, and `title`.
- Search returns normalized citations for chat responses.

### Task 8: MCP Adapter Layer

**Files:**
- Create `backend/app/mcp_clients.py`
- Create `backend/tests/test_mcp_clients.py`
- Modify `backend/requirements.txt`

**Verification:**
- `cd backend && pytest tests/test_mcp_clients.py -v`

**Acceptance:**
- Jira and Notion MCP access is hidden behind one adapter layer.
- Tests do not require live Atlassian or Notion credentials.
- Tool results are normalized before agents consume them.

### Task 9: `meeting_participation` Agent

**Files:**
- Create `backend/app/agents/meeting_participation.py`
- Create `backend/tests/test_meeting_participation.py`
- Modify `backend/app/runtime/orchestrator.py`

**Verification:**
- `cd backend && pytest tests/test_meeting_participation.py -v`

**Acceptance:**
- The agent loads meeting artifacts, produces analysis, and writes indexed RAG records.
- The agent never touches Jira or Notion tools.
- Meeting processing can end without `jira_notion` when no external references are found.

### Task 10: `jira_notion` Agent And Updates API

**Files:**
- Create `backend/app/agents/jira_notion.py`
- Create `backend/app/routers/updates.py`
- Create `backend/tests/test_jira_notion.py`
- Create or extend `backend/tests/test_api_smoke.py`
- Modify `backend/app/main.py`
- Modify `backend/app/models.py`

**Verification:**
- `cd backend && pytest tests/test_jira_notion.py tests/test_api_smoke.py -v`

**Acceptance:**
- Jira and Notion reads happen only through this agent.
- Risky writes require prior approval.
- Update apply attempts are idempotent and recorded.

### Task 11: `user_chat` Agent And Chat SSE API

**Files:**
- Create `backend/app/agents/user_chat.py`
- Create `backend/app/routers/chat.py`
- Create `backend/tests/test_user_chat.py`
- Create or extend `backend/tests/test_api_smoke.py`
- Modify `backend/app/main.py`
- Modify `backend/app/runtime/orchestrator.py`

**Verification:**
- `cd backend && pytest tests/test_user_chat.py tests/test_api_smoke.py -v`

**Acceptance:**
- Chat always starts and ends in `user_chat`.
- `jira_notion` is used only when live Jira or Notion context is required.
- SSE events stream answer content and citations.

### Task 12: Meetings API And Background Jobs

**Files:**
- Create `backend/app/routers/meetings.py`
- Create or extend `backend/tests/test_api_smoke.py`
- Modify `backend/app/main.py`

**Verification:**
- `cd backend && pytest tests/test_api_smoke.py -v`

**Acceptance:**
- `/meetings`, `/meetings/{id}`, `/meetings/sync`, and `/meetings/{id}/process` are available.
- Background jobs are explicit and observable.
- Meeting processing uses the runtime orchestrator.

### Task 13: Settings And Trace APIs

**Files:**
- Create `backend/app/routers/settings.py`
- Create `backend/app/routers/trace.py`
- Create or extend `backend/tests/test_api_smoke.py`
- Modify `backend/app/main.py`

**Verification:**
- `cd backend && pytest tests/test_api_smoke.py -v`

**Acceptance:**
- Secrets are write-only or environment-only.
- The trace API exposes runs, handoffs, and step payloads.
- The frontend can audit why an external action was proposed.

### Task 14: Frontend API Client And Auth Helpers

**Files:**
- Create `frontend/src/lib/types.ts`
- Create `frontend/src/lib/api.ts`
- Create `frontend/src/lib/auth.ts`
- Create `frontend/src/components/AuthGuard.tsx`
- Create `frontend/tests/api.test.ts`
- Create `frontend/tests/auth.test.ts`

**Verification:**
- `cd frontend && npm test -- api.test.ts auth.test.ts`

**Acceptance:**
- Frontend has one API client path.
- Token storage is centralized.
- Components do not call `fetch` directly.

### Task 15: Frontend Shell And Primary Screens

**Files:**
- Create `frontend/src/components/AppShell.tsx`
- Create `frontend/src/components/Nav.tsx`
- Create `frontend/src/components/StatusBadge.tsx`
- Create `frontend/src/app/chat/page.tsx`
- Create `frontend/src/app/meetings/page.tsx`
- Create `frontend/src/app/meetings/[id]/page.tsx`
- Create `frontend/src/app/updates/page.tsx`
- Create `frontend/src/app/settings/page.tsx`
- Create `frontend/src/app/trace/page.tsx`
- Create or extend frontend tests

**Verification:**
- `cd frontend && npm test`

**Acceptance:**
- Chat, Meetings, Updates, Settings, and Trace use a shared shell.
- Meetings pages surface transcript, summary, decisions, and action items.
- Updates page makes approval explicit and traceable.

### Task 16: Docker Smoke And Final Quality Gate

**Files:**
- Create `frontend/tests/smoke.spec.ts`
- Modify `docker-compose.yml`
- Modify `backend/Dockerfile`
- Modify `frontend/Dockerfile`
- Update project README if needed

**Verification:**
- `cd backend && pytest -v`
- `cd frontend && npm test && npm run build`
- `docker compose config`
- If Docker is available: `docker compose up --build` and `curl -fsS http://localhost:8000/health`

**Acceptance:**
- Backend tests pass.
- Frontend unit tests pass.
- Frontend production build succeeds.
- Docker Compose config is valid.
- No live OpenAI, Google, Jira, or Notion call is required for smoke tests.

---

## 6. Implementation Order Summary

1. Scaffold and environment.
2. SQLite models.
3. Auth.
4. OpenAI gateway.
5. DeepAgents runtime, orchestrator, and trace store.
6. Google Calendar and Meet adapter.
7. RAG service.
8. MCP adapter layer.
9. `meeting_participation` agent.
10. `jira_notion` agent and updates API.
11. `user_chat` agent and chat SSE API.
12. Meetings API and background jobs.
13. Settings and trace APIs.
14. Frontend API and auth helpers.
15. Frontend shell and primary screens.
16. Docker smoke tests and final quality gate.

---

## 7. Risk Controls

1. **External APIs:** Every external integration must have a fake implementation for tests.
2. **OpenAI cost and availability:** Unit tests must fake `ChatOpenAI`; live calls are reserved for manual smoke checks.
3. **Transcript gaps:** Missing native transcripts must become `no_transcript`, not a failed meeting.
4. **MCP instability:** Jira and Notion access must sit behind one adapter layer so agents can be tested without remote MCP.
5. **Single-container complexity:** Agent orchestration, background jobs, and API routes share one backend process boundary, so runtime contracts must stay explicit and typed.
6. **Approval safety:** Risky Jira and Notion writes must only happen through `jira_notion` after approval.
7. **Scope creep:** diarization, OCR, browser participant fallback, live assistant features, multi-tenant permissions, Redis workers, and multi-provider LLM routing are outside MVP v2.

---

## 8. Definition Of Done

MVP v2 is complete when:

1. A user from `@municorn.com` can log in.
2. The backend can sync Calendar events with Meet links.
3. Meeting processing runs through the DeepAgents runtime using `meeting_participation` and optional `jira_notion`.
4. Meeting transcript, summary, decisions, and action items are stored in SQLite.
5. Meeting artifacts are indexed in RAG-Anything.
6. Chat answers are produced by `user_chat`, include citations, and can request live Jira or Notion context through `jira_notion`.
7. Jira and Notion updates are staged, reviewable, and require approval before risky writes.
8. The UI exposes Chat, Meetings, Updates, Settings, and Agent Trace.
9. Backend tests, frontend tests, frontend build, and Docker smoke checks pass.
10. The final session pushes both git and beads data to remote.
