---
type: domain
title: "Backend"
created: 2026-05-10
updated: 2026-05-10
tags: [domain, backend, python]
---

# Backend

Single Python container. FastAPI + DeepAgents runtime + 3 agents + SQLite + RAG + MCP, all in one process. Source: [[sources/tech-architecture]], [[sources/mvp-v2-plan]].

> [!key-insight] Status (2026-06-01): scaffold **bootstrapped** (`ScrumAgent-9cg`) — `main.py` (`/health`), `config.py`, `database.py`, `deps.py` exist with tests green. The rest of the layout below is still `planned`. Dependencies are added **lazily per module** (lean `requirements.txt`), not all up front, so the image always builds from a clean checkout.

## Layout

```text
backend/
├── Dockerfile
├── requirements.txt
├── pytest.ini
└── app/
    ├── main.py
    ├── config.py
    ├── auth.py
    ├── deps.py
    ├── database.py
    ├── models.py
    ├── llm.py
    ├── rag.py
    ├── calendar_sync.py
    ├── mcp_clients.py
    ├── trace_store.py
    ├── runtime/
    │   ├── contracts.py
    │   └── orchestrator.py
    ├── agents/
    │   ├── meeting_participation.py
    │   ├── user_chat.py
    │   └── jira_notion.py
    └── routers/
        ├── auth.py
        ├── chat.py
        ├── meetings.py
        ├── updates.py
        ├── settings.py
        └── trace.py
```

## Modules

- [[modules/llm-gateway]] — `app/llm.py`
- [[modules/rag]] — `app/rag.py`
- [[modules/calendar-sync]] — `app/calendar_sync.py`
- [[modules/mcp-clients]] — `app/mcp_clients.py`
- [[modules/runtime-orchestrator]] — `app/runtime/`
- [[modules/trace-store]] — `app/trace_store.py`

## Routers

| Router | Endpoints |
|---|---|
| `auth.py` | Google OAuth callback, JWT issuance |
| `chat.py` | SSE streaming chat |
| `meetings.py` | List, detail, transcript, summary, action items |
| `updates.py` | Staged Jira/Notion updates: list, approve, reject, apply |
| `settings.py` | Integration config (secrets never returned) |
| `trace.py` | Agent run + step inspection |

## Conventions

- Tests are mandatory before code (TDD) — see [[sources/mvp-v2-plan]] §1.
- Issue tracking via `bd` (beads), not markdown TODOs.
- `requirements.txt` includes `fastapi`, `uvicorn`, `sqlalchemy`, `langchain-openai`, DeepAgents runtime, MCP Python client, `langchain-mcp-adapters`, RAG-Anything, Google API clients, `python-jose`, `pytest`.
