# Telecom Scrum Agent — MVP v2 Implementation Plan

> **For agentic workers:** REQUIRED STARTING SKILL: use `superpowers:using-superpowers` before any work in a session.
>
> **Required execution skill:** use `superpowers:subagent-driven-development` when splitting independent tasks, or `superpowers:executing-plans` when executing this plan inline.
>
> **Required engineering discipline:** use `superpowers:test-driven-development` for every feature, bug fix, refactor, and behavior change. No production code without a failing test first.
>
> **Tracking rule:** use `bd` for execution tracking. Do not track progress by editing checkboxes in this file.

**Goal:** Build the local MVP v2 of Telecom Scrum Agent with LangGraph orchestration, OpenAI as the only LLM provider, RAG-Anything knowledge storage, Google Calendar/Meet ingest, Jira/Notion MCP integration, and a Next.js UI for chat, meetings, updates, settings, and agent trace.

**Architecture:** Two Docker Compose services plus a shared `./data` volume. The backend is a FastAPI REST/SSE API that owns auth, SQLite, background jobs, LangGraph graphs, RAG, MCP clients, and agent trace persistence. The frontend is a Next.js App Router application that calls the backend only through typed API helpers.

**Tech Stack:**
- Backend: FastAPI, Uvicorn, SQLAlchemy, SQLite, LangGraph, LangChain Core, `langchain-openai`, `langchain-mcp-adapters`, MCP Python client, RAG-Anything, Google auth/API clients, python-jose, pytest.
- LLM provider: OpenAI only, configured through `OPENAI_API_KEY` and `OPENAI_MODEL`.
- Frontend: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Vitest or Jest for unit tests, Playwright for browser smoke tests.
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
│   │   ├── graphs/
│   │   │   ├── __init__.py
│   │   │   ├── state.py
│   │   │   ├── supervisor.py
│   │   │   ├── meeting_graph.py
│   │   │   └── chat_graph.py
│   │   ├── modules/
│   │   │   └── scrum/
│   │   │       ├── __init__.py
│   │   │       ├── meeting_agent.py
│   │   │       ├── rag_agent.py
│   │   │       ├── jira_agent.py
│   │   │       ├── notion_agent.py
│   │   │       └── chat_agent.py
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
│       ├── test_graph_state.py
│       ├── test_meeting_graph.py
│       ├── test_chat_graph.py
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
- The backend must fail fast if `OPENAI_API_KEY` is missing when an LLM endpoint or graph node is invoked.
- `OPENAI_MODEL` must be configurable; tests must not depend on a live OpenAI request.

---

## 4. LangGraph Design

### 4.1 Agent State

`backend/app/graphs/state.py` owns the shared state:

```python
from typing import Annotated, Literal, Optional, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


GraphMode = Literal["meeting_pipeline", "chat"]
NextAgent = Literal["meeting_agent", "rag_agent", "jira_agent", "notion_agent", "chat_agent", "END"]


class AgentState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    mode: GraphMode
    user_id: str
    meeting_id: Optional[str]
    query: Optional[str]
    next_agent: NextAgent
    context: dict
    retrieval_results: list[dict]
    proposed_updates: list[dict]
    final_answer: Optional[str]
    trace_id: Optional[str]
```

### 4.2 Meeting Pipeline Route

The MVP v2 meeting graph is deterministic in order, but still uses LangGraph for traceable orchestration:

```text
START
  -> meeting_agent
  -> rag_agent
  -> jira_agent
  -> notion_agent
  -> END
```

`meeting_agent` fetches artifacts and analyzes the meeting with OpenAI. `rag_agent` indexes transcript, summary, decisions, and action items. `jira_agent` proposes Jira updates. `notion_agent` proposes or creates Notion meeting notes according to the human-in-the-loop rules.

### 4.3 Chat Route

The chat graph uses supervisor routing because the query may need only RAG, or RAG plus Jira/Notion context:

```text
START
  -> supervisor
  -> rag_agent
  -> optional jira_agent
  -> optional notion_agent
  -> chat_agent
  -> END
```

The supervisor must return strict JSON:

```json
{"next_agent":"rag_agent","reasoning":"Need retrieval before answering."}
```

### 4.4 Human-In-The-Loop Rules

Automatic without approval:
- Add meeting summary as a comment when the issue/page was explicitly mentioned.
- Link meeting record to the target object in local SQLite.
- Add local metadata tag `mentioned-in-meeting`.
- Create Notion meeting note when the configured Notion parent exists.

Require explicit approval:
- Jira assignee, status, due date, estimate, priority, description.
- Notion page edits beyond appending meeting notes.
- Creating Jira subtasks.

---

## 5. Iterative Implementation Plan

Each task is intentionally small enough to complete, test, commit, and push independently.

### Task 1: Project Scaffold

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

**TDD sequence:**
1. Write `backend/tests/test_config.py` to prove config loads `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`, and `RAG_STORAGE_PATH` from environment.
2. Run:

```bash
cd backend
pytest tests/test_config.py -v
```

Expected first result: fail because `app.config` does not exist.

3. Implement `backend/app/config.py` with a `Settings` dataclass and `get_settings()`.
4. Add `GET /health` in `backend/app/main.py`.
5. Run:

```bash
cd backend
pytest tests/test_config.py -v
```

Expected result after implementation: pass.

6. Run:

```bash
docker compose config
```

Expected result: Compose renders both services without schema errors.

7. Commit:

```bash
git add docker-compose.yml .env.example backend frontend
git commit -m "feat: scaffold MVP v2 app"
```

Acceptance:
- Backend container exposes port `8000`.
- Frontend container exposes port `3000`.
- `./data` is mounted to `/data`.
- No Anthropic environment variable is required.

### Task 2: SQLite Database And Models

**Files:**
- Create `backend/app/database.py`
- Create `backend/app/models.py`
- Create `backend/tests/conftest.py`
- Create `backend/tests/test_models.py`
- Modify `backend/app/main.py`

**TDD sequence:**
1. Write tests for these tables: `User`, `Meeting`, `MeetingArtifact`, `ProposedUpdate`, `AgentRun`, `AgentStep`, `Setting`.
2. Run:

```bash
cd backend
pytest tests/test_models.py -v
```

Expected first result: fail because models do not exist.

3. Implement SQLAlchemy engine/session setup and models.
4. Add startup table creation in `main.py`.
5. Run:

```bash
cd backend
pytest tests/test_models.py -v
```

Expected result: pass.

6. Commit:

```bash
git add backend/app/database.py backend/app/models.py backend/app/main.py backend/tests
git commit -m "feat: add SQLite models"
```

Acceptance:
- Test DB uses in-memory SQLite.
- Runtime DB uses `DATABASE_URL`.
- Agent trace tables are present from the start.

### Task 3: Auth And Domain Restriction

**Files:**
- Create `backend/app/auth.py`
- Create `backend/app/deps.py`
- Create `backend/app/routers/auth.py`
- Create `backend/tests/test_auth.py`
- Modify `backend/app/main.py`

**TDD sequence:**
1. Write tests for `is_allowed_email`, `create_token`, `decode_token`, invalid token rejection, and blocked non-`@municorn.com` users.
2. Run:

```bash
cd backend
pytest tests/test_auth.py -v
```

Expected first result: fail because auth helpers do not exist.

3. Implement Google OAuth URL generation, JWT creation/decoding, and `get_current_user`.
4. Register `/auth/login`, `/auth/callback`, and `/auth/me`.
5. Run:

```bash
cd backend
pytest tests/test_auth.py -v
pytest tests/test_api_smoke.py -v
```

Expected result: pass.

6. Commit:

```bash
git add backend/app/auth.py backend/app/deps.py backend/app/routers/auth.py backend/app/main.py backend/tests
git commit -m "feat: add Google OAuth and JWT auth"
```

Acceptance:
- Only the configured `ALLOWED_DOMAIN` is accepted.
- JWT contains `sub`, `email`, `name`, `picture`, and `exp`.
- OAuth callback redirects to `FRONTEND_URL/auth/callback?token=<jwt>`.

### Task 4: OpenAI LLM Gateway

**Files:**
- Create `backend/app/llm.py`
- Create `backend/tests/test_llm.py`
- Modify `backend/requirements.txt`

**TDD sequence:**
1. Write tests using a fake chat model for:
   - missing `OPENAI_API_KEY` raises a clear configuration error,
   - `get_chat_model()` uses `OPENAI_MODEL`,
   - `analyze_meeting_text()` parses strict JSON into a Python dict,
   - invalid model JSON returns a typed error result without crashing the graph.
2. Run:

```bash
cd backend
pytest tests/test_llm.py -v
```

Expected first result: fail because `app.llm` does not exist.

3. Add dependencies:

```text
langgraph
langchain-core
langchain-openai
openai
```

4. Implement `get_chat_model(settings)` using `ChatOpenAI`.
5. Implement `analyze_meeting_text(llm, transcript, title, participants)` with a strict JSON prompt.
6. Run:

```bash
cd backend
pytest tests/test_llm.py -v
```

Expected result: pass without network calls.

7. Commit:

```bash
git add backend/app/llm.py backend/requirements.txt backend/tests/test_llm.py
git commit -m "feat: add OpenAI LLM gateway"
```

Acceptance:
- `langchain-anthropic` is not required.
- Tests fake the LLM and never call OpenAI.
- Production code uses `OPENAI_API_KEY` only at runtime.

### Task 5: LangGraph State, Trace Store, And Deterministic Meeting Graph

**Files:**
- Create `backend/app/graphs/state.py`
- Create `backend/app/graphs/meeting_graph.py`
- Create `backend/app/trace_store.py`
- Create `backend/tests/test_graph_state.py`
- Create `backend/tests/test_meeting_graph.py`
- Modify `backend/app/models.py`

**TDD sequence:**
1. Write tests proving `AgentState` accepts appended LangChain messages.
2. Write a graph test with fake node functions that records this exact order:

```text
meeting_agent -> rag_agent -> jira_agent -> notion_agent
```

3. Write trace tests proving every node writes `AgentStep` rows with `step_name`, `input_json`, `output_json`, and `tool_calls`.
4. Run:

```bash
cd backend
pytest tests/test_graph_state.py tests/test_meeting_graph.py -v
```

Expected first result: fail because graph files do not exist.

5. Implement `AgentState`.
6. Implement `build_meeting_graph(services)` with `StateGraph(AgentState)`.
7. Implement `TraceStore.start_run()`, `TraceStore.record_step()`, and `TraceStore.finish_run()`.
8. Run:

```bash
cd backend
pytest tests/test_graph_state.py tests/test_meeting_graph.py -v
```

Expected result: pass.

9. Commit:

```bash
git add backend/app/graphs backend/app/trace_store.py backend/app/models.py backend/tests
git commit -m "feat: add LangGraph meeting orchestration"
```

Acceptance:
- LangGraph is the orchestration layer from this task onward.
- Meeting pipeline order is deterministic for MVP.
- Agent trace persistence is part of graph execution.

### Task 6: Google Calendar And Meet Adapter

**Files:**
- Create `backend/app/calendar_sync.py`
- Create `backend/tests/test_calendar_sync.py`
- Modify `backend/app/models.py`

**TDD sequence:**
1. Write tests with fake Google service objects for:
   - events without Meet links are ignored,
   - Meet links create `Meeting` rows,
   - duplicate calendar event IDs are skipped,
   - transcript entries are converted into speaker-prefixed lines,
   - missing transcript marks the meeting as `no_transcript`.
2. Run:

```bash
cd backend
pytest tests/test_calendar_sync.py -v
```

Expected first result: fail because `calendar_sync.py` does not exist.

3. Implement service-account credential loading from `SA_KEY_PATH`.
4. Implement `sync_calendar_events(db, subject_email)`.
5. Implement `fetch_meet_artifacts(db, meeting)`.
6. Run:

```bash
cd backend
pytest tests/test_calendar_sync.py -v
```

Expected result: pass without Google network calls.

7. Commit:

```bash
git add backend/app/calendar_sync.py backend/app/models.py backend/tests/test_calendar_sync.py
git commit -m "feat: add Google Calendar and Meet ingest"
```

Acceptance:
- Domain-wide delegation subject is configurable.
- No test depends on live Google APIs.
- Meetings store raw transcript and artifact status.

### Task 7: RAG-Anything Service

**Files:**
- Create `backend/app/rag.py`
- Create `backend/tests/test_rag.py`
- Modify `backend/requirements.txt`

**TDD sequence:**
1. Write tests with a fake RAG backend for:
   - meeting transcript indexing stores source metadata,
   - summary/action/decision indexing creates separate source records,
   - query returns normalized citations,
   - RAG storage path is created when missing.
2. Run:

```bash
cd backend
pytest tests/test_rag.py -v
```

Expected first result: fail because `app.rag` does not exist.

3. Add dependency:

```text
rag-anything
```

4. Implement `RAGService.index_meeting(meeting, analysis)`.
5. Implement `RAGService.search(query, top_k=8)`.
6. Run:

```bash
cd backend
pytest tests/test_rag.py -v
```

Expected result: pass.

7. Commit:

```bash
git add backend/app/rag.py backend/requirements.txt backend/tests/test_rag.py
git commit -m "feat: add RAG-Anything service"
```

Acceptance:
- The service exposes a small app-owned interface, not raw RAG-Anything calls across the codebase.
- Every indexed item has `source_type`, `source_id`, `meeting_id`, and `title` metadata.

### Task 8: Scrum Module Agents

**Files:**
- Create `backend/app/modules/scrum/meeting_agent.py`
- Create `backend/app/modules/scrum/rag_agent.py`
- Create `backend/app/modules/scrum/jira_agent.py`
- Create `backend/app/modules/scrum/notion_agent.py`
- Create `backend/app/modules/scrum/chat_agent.py`
- Create `backend/app/modules/scrum/__init__.py`
- Modify `backend/app/graphs/meeting_graph.py`
- Create or extend `backend/tests/test_meeting_graph.py`

**TDD sequence:**
1. Write node-level tests with fake services:
   - `meeting_agent` loads transcript and writes analysis into `state["context"]["analysis"]`,
   - `rag_agent` indexes analysis and records indexed source IDs,
   - `jira_agent` appends proposed Jira updates only when issues are explicit,
   - `notion_agent` appends proposed Notion updates or note creation requests,
   - each node preserves existing state keys.
2. Run:

```bash
cd backend
pytest tests/test_meeting_graph.py -v
```

Expected first result: fail because scrum module node functions do not exist.

3. Implement one node at a time, rerunning its failing test after each implementation.
4. Run the full graph tests:

```bash
cd backend
pytest tests/test_meeting_graph.py -v
```

Expected result: pass.

5. Commit:

```bash
git add backend/app/modules/scrum backend/app/graphs/meeting_graph.py backend/tests/test_meeting_graph.py
git commit -m "feat: add scrum LangGraph agents"
```

Acceptance:
- Agent functions are plain Python callables compatible with LangGraph nodes.
- Business rules live in agents, not routers.
- Each agent is testable without FastAPI.

### Task 9: MCP Clients For Jira And Notion

**Files:**
- Create `backend/app/mcp_clients.py`
- Create `backend/tests/test_mcp_clients.py`
- Modify `backend/requirements.txt`

**TDD sequence:**
1. Write tests with fake MCP sessions for:
   - Atlassian tools are loaded once and cached,
   - Notion tools are loaded once and cached,
   - missing token disables write tools with a clear error,
   - tool invocation results are normalized into `ToolResult`.
2. Run:

```bash
cd backend
pytest tests/test_mcp_clients.py -v
```

Expected first result: fail because `mcp_clients.py` does not exist.

3. Add dependencies:

```text
mcp
langchain-mcp-adapters
```

4. Implement `MCPToolRegistry`.
5. Implement `get_jira_tools()` and `get_notion_tools()`.
6. Run:

```bash
cd backend
pytest tests/test_mcp_clients.py -v
```

Expected result: pass without connecting to remote MCP servers.

7. Commit:

```bash
git add backend/app/mcp_clients.py backend/requirements.txt backend/tests/test_mcp_clients.py
git commit -m "feat: add Jira and Notion MCP clients"
```

Acceptance:
- MCP is behind an adapter interface.
- Tests do not require Atlassian or Notion credentials.
- Agents can request tools through shared services.

### Task 10: Proposed Updates And Approval API

**Files:**
- Create `backend/app/routers/updates.py`
- Create or extend `backend/tests/test_api_smoke.py`
- Modify `backend/app/main.py`
- Modify `backend/app/models.py`

**TDD sequence:**
1. Write API tests for:
   - list pending updates,
   - approve update,
   - reject update,
   - apply approved update through fake Jira/Notion clients,
   - prevent applying rejected or already applied updates.
2. Run:

```bash
cd backend
pytest tests/test_api_smoke.py -v
```

Expected first result: fail because update routes do not exist.

3. Implement `/updates`, `/updates/{id}/approve`, `/updates/{id}/reject`, `/updates/{id}/apply`.
4. Run:

```bash
cd backend
pytest tests/test_api_smoke.py -v
```

Expected result: pass.

5. Commit:

```bash
git add backend/app/routers/updates.py backend/app/main.py backend/app/models.py backend/tests/test_api_smoke.py
git commit -m "feat: add proposed update approval API"
```

Acceptance:
- Applying changes is idempotent.
- Dangerous changes require prior approval.
- Every apply attempt records a sync operation or trace step.

### Task 11: Chat Graph And SSE API

**Files:**
- Create `backend/app/graphs/supervisor.py`
- Create `backend/app/graphs/chat_graph.py`
- Create `backend/app/routers/chat.py`
- Create `backend/tests/test_chat_graph.py`
- Modify `backend/app/main.py`

**TDD sequence:**
1. Write tests for supervisor JSON parsing:
   - valid `next_agent` is accepted,
   - unknown `next_agent` becomes a controlled error,
   - malformed JSON falls back to `rag_agent`.
2. Write graph tests:
   - query always visits `rag_agent`,
   - query can optionally visit Jira/Notion context nodes,
   - `chat_agent` produces `final_answer` with citations.
3. Write API test proving `/chat` returns SSE frames.
4. Run:

```bash
cd backend
pytest tests/test_chat_graph.py tests/test_api_smoke.py -v
```

Expected first result: fail because chat graph/routes do not exist.

5. Implement supervisor prompt using OpenAI through `llm.py`.
6. Implement `build_chat_graph(services)`.
7. Implement `/chat` SSE route.
8. Run:

```bash
cd backend
pytest tests/test_chat_graph.py tests/test_api_smoke.py -v
```

Expected result: pass.

9. Commit:

```bash
git add backend/app/graphs/supervisor.py backend/app/graphs/chat_graph.py backend/app/routers/chat.py backend/app/main.py backend/tests
git commit -m "feat: add LangGraph chat orchestration"
```

Acceptance:
- LangGraph controls chat orchestration.
- SSE route streams answer chunks or structured events.
- Citations include source type and source ID.

### Task 12: Meetings API And Background Jobs

**Files:**
- Create `backend/app/routers/meetings.py`
- Create `backend/tests/test_api_smoke.py`
- Modify `backend/app/main.py`

**TDD sequence:**
1. Write tests for:
   - list meetings,
   - get meeting detail,
   - start calendar sync,
   - start meeting processing,
   - processing updates meeting status through fake graph execution.
2. Run:

```bash
cd backend
pytest tests/test_api_smoke.py -v
```

Expected first result: fail because meeting routes do not exist.

3. Implement `/meetings`, `/meetings/{id}`, `/meetings/sync`, `/meetings/{id}/process`.
4. Run:

```bash
cd backend
pytest tests/test_api_smoke.py -v
```

Expected result: pass.

5. Commit:

```bash
git add backend/app/routers/meetings.py backend/app/main.py backend/tests/test_api_smoke.py
git commit -m "feat: add meetings API"
```

Acceptance:
- Background jobs are explicit and observable.
- Meeting processing invokes the LangGraph meeting graph.
- Meeting status transitions are persisted.

### Task 13: Settings And Trace APIs

**Files:**
- Create `backend/app/routers/settings.py`
- Create `backend/app/routers/trace.py`
- Create or extend `backend/tests/test_api_smoke.py`
- Modify `backend/app/main.py`

**TDD sequence:**
1. Write tests for:
   - read settings,
   - update non-secret settings,
   - reject attempts to return secret values,
   - list agent runs,
   - get agent steps for a run.
2. Run:

```bash
cd backend
pytest tests/test_api_smoke.py -v
```

Expected first result: fail because routes do not exist.

3. Implement settings and trace routers.
4. Run:

```bash
cd backend
pytest tests/test_api_smoke.py -v
```

Expected result: pass.

5. Commit:

```bash
git add backend/app/routers/settings.py backend/app/routers/trace.py backend/app/main.py backend/tests/test_api_smoke.py
git commit -m "feat: add settings and trace APIs"
```

Acceptance:
- Secrets are write-only or environment-only.
- Agent trace can be inspected from the UI.

### Task 14: Frontend API Client And Auth Guard

**Files:**
- Create `frontend/src/lib/types.ts`
- Create `frontend/src/lib/api.ts`
- Create `frontend/src/lib/auth.ts`
- Create `frontend/src/components/AuthGuard.tsx`
- Create `frontend/tests/api.test.ts`
- Create `frontend/tests/auth.test.ts`

**TDD sequence:**
1. Write frontend tests for:
   - API client attaches bearer token,
   - API client throws typed errors,
   - auth callback stores JWT,
   - auth guard redirects when no token exists.
2. Run:

```bash
cd frontend
npm test -- api.test.ts auth.test.ts
```

Expected first result: fail because helper files do not exist.

3. Implement `api.ts`, `auth.ts`, and `AuthGuard`.
4. Run:

```bash
cd frontend
npm test -- api.test.ts auth.test.ts
```

Expected result: pass.

5. Commit:

```bash
git add frontend/src/lib frontend/src/components/AuthGuard.tsx frontend/tests
git commit -m "feat: add frontend API and auth helpers"
```

Acceptance:
- Frontend has one API client path.
- Token storage is centralized.
- Components do not call `fetch` directly.

### Task 15: Frontend App Shell

**Files:**
- Create `frontend/src/components/AppShell.tsx`
- Create `frontend/src/components/Nav.tsx`
- Create `frontend/src/components/StatusBadge.tsx`
- Modify `frontend/src/app/layout.tsx`
- Modify `frontend/src/app/page.tsx`

**TDD sequence:**
1. Write component tests for navigation labels and active route state.
2. Run:

```bash
cd frontend
npm test -- AppShell
```

Expected first result: fail because shell components do not exist.

3. Implement shell components following `pages/design-brief.md`.
4. Run:

```bash
cd frontend
npm test -- AppShell
```

Expected result: pass.

5. Commit:

```bash
git add frontend/src/components frontend/src/app
git commit -m "feat: add frontend app shell"
```

Acceptance:
- Project-level screens use a consistent sidebar.
- The UI is desktop-first and information-dense.

### Task 16: Chat UI

**Files:**
- Create `frontend/src/app/chat/page.tsx`
- Create or extend frontend tests for chat behavior.

**TDD sequence:**
1. Write tests for:
   - message submit calls `/chat`,
   - streaming events append answer text,
   - citations render with source labels,
   - disabled state prevents duplicate sends.
2. Run:

```bash
cd frontend
npm test -- chat
```

Expected first result: fail because page does not exist.

3. Implement chat page using the shared API client.
4. Run:

```bash
cd frontend
npm test -- chat
```

Expected result: pass.

5. Commit:

```bash
git add frontend/src/app/chat frontend/tests
git commit -m "feat: add chat UI"
```

Acceptance:
- Chat shows answer, citations, loading state, and errors.
- Chat does not hide source provenance.

### Task 17: Meetings UI

**Files:**
- Create `frontend/src/app/meetings/page.tsx`
- Create `frontend/src/app/meetings/[id]/page.tsx`
- Create or extend frontend tests for meetings.

**TDD sequence:**
1. Write tests for:
   - meetings list renders status and title,
   - sync button calls `/meetings/sync`,
   - detail page renders transcript, summary, action items, decisions,
   - process button calls `/meetings/{id}/process`.
2. Run:

```bash
cd frontend
npm test -- meetings
```

Expected first result: fail because pages do not exist.

3. Implement meetings pages.
4. Run:

```bash
cd frontend
npm test -- meetings
```

Expected result: pass.

5. Commit:

```bash
git add frontend/src/app/meetings frontend/tests
git commit -m "feat: add meetings UI"
```

Acceptance:
- Operators can see ingest and processing state.
- Meeting details expose the artifacts needed to trust the AI output.

### Task 18: Updates, Settings, And Trace UI

**Files:**
- Create `frontend/src/app/updates/page.tsx`
- Create `frontend/src/app/settings/page.tsx`
- Create `frontend/src/app/trace/page.tsx`
- Create or extend frontend tests.

**TDD sequence:**
1. Write tests for:
   - updates list renders before/after or content payload,
   - approve/reject/apply buttons call the correct endpoints,
   - settings page masks secrets,
   - trace page renders run status and step names.
2. Run:

```bash
cd frontend
npm test -- updates settings trace
```

Expected first result: fail because pages do not exist.

3. Implement the three pages.
4. Run:

```bash
cd frontend
npm test -- updates settings trace
```

Expected result: pass.

5. Commit:

```bash
git add frontend/src/app/updates frontend/src/app/settings frontend/src/app/trace frontend/tests
git commit -m "feat: add updates settings and trace UI"
```

Acceptance:
- Human approval is explicit.
- Settings never expose secret values.
- Agent Trace shows enough detail to audit graph behavior.

### Task 19: Docker Integration And Local Smoke Test

**Files:**
- Modify `docker-compose.yml`
- Modify `backend/Dockerfile`
- Modify `frontend/Dockerfile`
- Create `frontend/tests/smoke.spec.ts`
- Create or update project README if needed.

**TDD sequence:**
1. Write Playwright smoke test for:
   - home page loads,
   - unauthenticated protected page redirects,
   - health endpoint is reachable,
   - mock-authenticated meetings page can render seeded data.
2. Run:

```bash
cd frontend
npm run test:e2e
```

Expected first result: fail because the app is not wired for e2e smoke.

3. Wire Docker Compose and test seed configuration.
4. Run:

```bash
docker compose up --build
```

5. In another shell, run:

```bash
curl -fsS http://localhost:8000/health
cd frontend
npm run test:e2e
```

Expected result: health returns `{"status":"ok"}` and Playwright smoke tests pass.

6. Commit:

```bash
git add docker-compose.yml backend/Dockerfile frontend/Dockerfile frontend/tests README.md
git commit -m "test: add local Docker smoke coverage"
```

Acceptance:
- The app starts locally through Docker Compose.
- Health and frontend smoke tests pass.
- No live OpenAI, Google, Jira, or Notion call is required for smoke tests.

### Task 20: End-To-End Quality Gate

**Files:**
- No new files required unless tests expose gaps.

**Commands:**

```bash
cd backend
pytest -v
cd ../frontend
npm test
npm run build
cd ..
docker compose config
```

If Docker is available:

```bash
docker compose up --build
curl -fsS http://localhost:8000/health
```

Session close commands:

```bash
bd close <issue-id> --reason "Implemented and verified" --json
git status
git pull --rebase
bd dolt push
git push
git status
```

Acceptance:
- Backend tests pass.
- Frontend unit tests pass.
- Frontend production build succeeds.
- Docker Compose config is valid.
- Code, beads data, and git branch are pushed.

---

## 6. Implementation Order Summary

1. Scaffold and environment.
2. SQLite models.
3. Auth.
4. OpenAI LLM gateway.
5. LangGraph state, trace, and meeting graph.
6. Google Calendar/Meet adapter.
7. RAG-Anything service.
8. Scrum agents.
9. MCP clients.
10. Proposed updates API.
11. Chat graph and SSE API.
12. Meetings API and background jobs.
13. Settings and trace APIs.
14. Frontend API/auth helpers.
15. Frontend app shell.
16. Chat UI.
17. Meetings UI.
18. Updates/settings/trace UI.
19. Docker smoke tests.
20. Full quality gate and push.

---

## 7. Risk Controls

1. **External APIs:** Every external integration must have a fake implementation for tests.
2. **OpenAI cost and availability:** Unit tests must fake `ChatOpenAI`; live calls are reserved for manual smoke checks.
3. **Meet transcripts:** Missing native transcripts must become `no_transcript`, not a failed meeting.
4. **MCP instability:** Jira/Notion MCP clients must sit behind local adapters so agents can be tested without remote MCP.
5. **Traceability:** Every graph run writes `AgentRun` and `AgentStep` rows before UI work depends on traces.
6. **Human approval:** Dangerous Jira/Notion changes must not be applied from graph nodes directly.
7. **Scope creep:** Diarization, OCR, browser participant fallback, live assistant, multi-tenant permissions, Cloud Run production hardening, Redis workers, and multi-provider LLM routing are outside MVP v2.

---

## 8. Definition Of Done

MVP v2 is complete when:

1. A user from `@municorn.com` can log in.
2. The backend can sync Calendar events with Meet links.
3. A meeting can be processed through LangGraph.
4. Meeting transcript, summary, decisions, and action items are stored in SQLite.
5. Meeting artifacts are indexed in RAG-Anything.
6. Chat answers use LangGraph orchestration and include citations.
7. Jira/Notion updates are proposed and require approval before risky writes.
8. The UI exposes Chat, Meetings, Updates, Settings, and Agent Trace.
9. Backend tests, frontend tests, frontend build, and Docker smoke checks pass.
10. The final session pushes both git and beads data to remote.
