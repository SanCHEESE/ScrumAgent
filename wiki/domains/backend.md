---
type: domain
title: "Backend"
created: 2026-05-10
updated: 2026-06-02
tags: [domain, backend, python]
---

# Backend

Single Python container. FastAPI + DeepAgents runtime + 3 agents + SQLite + RAG + MCP, all in one process. Source: [[sources/tech-architecture]], [[sources/mvp-v2-plan]].

> [!key-insight] Status (2026-06-02): scaffold + **auth** (`ScrumAgent-u2b`, Google OAuth/JWT) + **persistence layer** (`ScrumAgent-67j`) done, 38 tests green. Done: `main.py` (lifespan bootstraps schema + crypto), `config.py`, `database.py`, `deps.py`, `oauth.py`, `security/` (JWT + Fernet), `models/` package, `repositories/chat.py`, `routers/auth.py`. The rest below is still `planned`. Dependencies are added **lazily per module** (lean `requirements.txt`), not all up front, so the image always builds from a clean checkout.

## Persistence

ORM in `app/models/` (package, one file per domain). **Portable by `settings.database_url`**: prod = **Cloud SQL for PostgreSQL** (`postgresql+psycopg://…`), local/tests = **SQLite** — no caller branches on dialect. See [[decisions/2026-06-01-cloud-sql-postgres-prod-db]].

Tables: `users` (kept from auth — int PK + `google_sub`), `conversations` + `messages` (**user chat history**, append-ordered by int PK), `meetings` + `meeting_artifacts`, `updates` (staged Jira/Notion writes), `trace_runs` + `trace_steps` (see [[modules/trace-store]]), `integrations` (settings UI, **secrets Fernet-encrypted at rest** via `EncryptedString`).

Portability conventions: string-UUID PKs (except `messages.id` int autoincrement for guaranteed chat order), `JSON`→`JSONB` variant on Postgres, `DateTime(timezone=True)`, `Enum(native_enum=False)`. SQLite FK integrity enforced via a `PRAGMA foreign_keys=ON` connect-event. Schema bootstrap = `init_db()` → `create_all` in the FastAPI lifespan (no Alembic yet — `bd` follow-up filed).

## Layout

```text
backend/
├── Dockerfile
├── requirements.txt
├── pytest.ini
└── app/
    ├── main.py
    ├── config.py
    ├── deps.py
    ├── database.py            # Base, make_engine, init_db, SQLite FK pragma
    ├── oauth.py
    ├── models/               # ORM package (one file per domain)
    │   ├── types.py          # JSONType, EncryptedString, mixins, enums
    │   ├── user.py · chat.py · meeting.py · trace.py · update.py · integration.py
    ├── security/             # _jwt.py (JWT) + crypto.py (Fernet)
    ├── repositories/         # chat.py (conversation/message helpers)
    ├── llm.py                # planned
    ├── rag.py                # planned
    ├── calendar_sync.py      # planned
    ├── mcp_clients.py        # planned
    ├── trace_store.py        # planned
    ├── runtime/              # planned (contracts.py, orchestrator.py)
    ├── agents/               # planned (meeting_participation, user_chat, jira_notion)
    └── routers/
        ├── auth.py           # done
        └── chat.py · meetings.py · updates.py · settings.py · trace.py  # planned
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
