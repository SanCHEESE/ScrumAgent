---
type: meta
title: "Hot Cache"
updated: 2026-06-02T12:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-02. **Persistence layer shipped (`ScrumAgent-67j`).** Full SQLAlchemy schema + user chat history, portable SQLite(local)/Cloud SQL Postgres(prod), 38 pytest green. On branch `feat/db-persistence-67j` (12 commits, not yet pushed/merged). Build order stays value-first: jira_notion slice → RAG → orchestrator.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose for Municorn (`@municorn.com`). Second deploy target = single GCE VM ([[decisions/2026-05-18-gcp-compute-engine-deployment]], [[flows/gcp-deployment-topology]]).
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG-Anything) and `frontend` (Next.js 14 + TS at `apps/web/`).
- Three agents only: `meeting_participation`, `user_chat`, `jira_notion`. Orchestrator-mediated.
- LLM OpenAI-only via `langchain-openai`, model **`gpt-5.4-mini`**. RAG is RAG-Anything.
- **Jira via Atlassian Rovo** ([[decisions/2026-05-18-rovo-replaces-jira-mcp]]). **Notion via MCP** (Notion-only).
- **NEW DB decision:** prod = **Cloud SQL for PostgreSQL**, local/tests = **SQLite** ([[decisions/2026-06-01-cloud-sql-postgres-prod-db]]). Schema is dialect-portable.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## Backend status
- **Persistence done** ([[domains/backend]] §Persistence): `app/models/` package — `user` (kept from auth: int PK + `google_sub`), `chat` (conversations + **messages** = user chat history, int-PK append order), `meeting`+`meeting_artifact`, `update` (staged Jira/Notion), `trace_run`+`trace_step`, `integration` (**secrets Fernet-encrypted at rest** via `EncryptedString`). `repositories/chat.py` = create_conversation/append_message/get_history. `database.py`: `make_engine` (SQLite StaticPool / Postgres pool_pre_ping) + `PRAGMA foreign_keys=ON` connect-event + `init_db`. Bootstrap via FastAPI lifespan `create_all` (no Alembic — `bd` follow-up filed).
- **Auth done** ([[modules/auth]], `ScrumAgent-u2b`): `oauth.py`, `security/` (JWT `_jwt.py` + Fernet `crypto.py`), `routers/auth.py`, `deps.get_current_user`. NOTE: the u2b auth feature (incl. frontend `apps/web/`) was committed mid-session as `d9cd97f` — it had been sitting uncommitted.
- Tests: **38 green** via `cd backend && .venv/bin/python -m pytest`.
- Portability conventions: string-UUID PKs (except `messages.id` int autoincrement), `JSON`→`JSONB` variant, `DateTime(timezone=True)`, `Enum(native_enum=False)`.
- Still `planned`: llm (`wqj`), rag, rovo, mcp-notion, calendar, trace-store module, orchestrator, 3 agents, routers (`2jb`).

## Open threads / housekeeping
- **Uncommitted, NOT mine** (left untouched): `docker-compose.yml`, `wiki/domains/deployment.md`, `wiki/log.md` (Colima/Docker daemon notes), `.claude/*`. Branch not pushed yet.
- New follow-ups filed: Alembic migrations (P2); Cloud SQL Python Connector / IAM (P3); Secret Manager refs for integrations (P3); update `deployment.md` to Cloud SQL (P3).
- `ScrumAgent-9cg` bootstrap (needs `docker compose up --build` once Docker daemon up — Colima notes in dirty `deployment.md`).

## Next (value-first slice 1 = jira_notion)
`wqj` llm → thin orchestrator (`die`) routing to one agent → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent → minimal routers (`2jb`, protected by `get_current_user`, persisting chat via `repositories/chat.py`) → staged-write on the frontend.
