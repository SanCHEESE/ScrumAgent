---
type: meta
title: "Hot Cache"
updated: 2026-06-01T16:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-01. **Auth slice shipped.** Google OAuth login + JWT (`ScrumAgent-u2b`) is implemented, tested (20 pytest green), and verified. Backend build order remains value-first: jira_notion slice → RAG → orchestrator.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose service for Municorn (`@municorn.com`). Second deploy target = single GCE VM ([[decisions/2026-05-18-gcp-compute-engine-deployment]], topology in [[flows/gcp-deployment-topology]]).
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + SQLite + RAG-Anything) and `frontend` (Next.js 14 + TS at `apps/web/`).
- Three agents only: `meeting_participation`, `user_chat`, `jira_notion`. Orchestrator-mediated; no agent-to-agent calls.
- LLM is OpenAI-only via `langchain-openai`, model **`gpt-5.4-mini`**. RAG is RAG-Anything.
- **Jira via Atlassian Rovo** ([[decisions/2026-05-18-rovo-replaces-jira-mcp]], [[modules/rovo-client]]). **Notion via MCP** ([[modules/mcp-clients]], Notion-only).
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd` (beads). TDD mandatory.

## Environment / setup status (personal account)
- `.env` at repo root (gitignored), validated green by `scripts/sanity_check.py`. `DATABASE_URL` defaults to the Docker path `/app/data/db/...`; for local non-Docker runs override it (the smoke test used a temp sqlite).
- Google OAuth Web client live (redirect `localhost:8000/auth/google/callback`) — **now exercised by real auth code**.
- **Deferred:** Google service-account + domain-wide delegation (no Workspace admin) → **blocks slice 3 (meetings)**; full GCP deploy. See `bd` memory `slice-3-meeting-participation-on-personal-municorn-no`.

## Backend status
- **Auth done** ([[modules/auth]]): `app/{oauth,security,models}.py`, `app/routers/auth.py`, `deps.get_current_user`. `/auth/google/{start,callback}`, `/auth/me`. CSRF state cookie; `@municorn.com` 403 gate; minimal `User` upsert on `google_sub`; JWT via fragment → frontend `localStorage`. `main.py` wires router + CORS + lifespan `create_all` (no Alembic yet).
- **Bootstrapped** earlier (`ScrumAgent-9cg`): `app/{main,config,database,deps}.py`, `Dockerfile`, lean `requirements.txt`, root `docker-compose.yml`. Container build still pending a Docker daemon.
- Tests: **20 green** under `-W error` (`tests/test_{health,config,deps,security,auth}.py`, `tests/conftest.py` with in-memory SQLite + fake `GoogleOAuthClient`).
- Still `planned`: full models schema (`67j`), llm (`wqj`), rag, rovo, mcp-notion, calendar, trace-store, orchestrator, 3 agents, routers (`2jb`).

## Active Threads
- `ScrumAgent-u2b` — auth — **CLOSED** (force; was graph-blocked by `67j`, satisfied by inline minimal User).
- `ScrumAgent-sdc` (new, P2) — frontend: attach bearer token to API client + guard `(shell)` routes (depends on routers `2jb`). Security note: localStorage token is XSS-exposed; revisit httpOnly-cookie + CSRF on the https deploy.
- `ScrumAgent-67j` — full SQLAlchemy schema — **EXTEND** `app/models.py` (don't recreate `User`); decide migrations here (note added).
- `ScrumAgent-9cg` — bootstrap (needs `docker compose up --build` once Docker is up).
- `ScrumAgent-d5g` — P2 frontend review follow-ups (open).

## Next (value-first slice 1 = jira_notion)
Real path: `67j` full models → `wqj` llm → thin orchestrator (`die`) routing to one agent → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent → minimal routers (`2jb`) → staged-write on the frontend. Auth + the `get_current_user` dep are ready to protect those routers.
