---
type: meta
title: "Hot Cache"
updated: 2026-06-01T12:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-01. **Backend implementation started.** Credentials wired + validated on personal `@municorn` accounts; `backend/` scaffold bootstrapped via TDD. Build order is value-first: jira_notion slice → RAG → orchestrator.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose service for Municorn (`@municorn.com`). Second deploy target = single GCE VM ([[decisions/2026-05-18-gcp-compute-engine-deployment]], topology in [[flows/gcp-deployment-topology]]).
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + SQLite + RAG-Anything) and `frontend` (Next.js 14 + TS at `apps/web/`).
- Three agents only: `meeting_participation`, `user_chat`, `jira_notion`. Orchestrator-mediated; no agent-to-agent calls.
- LLM is OpenAI-only via `langchain-openai`, model **`gpt-5.4-mini`** (key can't see 5.5/4.1). RAG is RAG-Anything.
- **Jira via Atlassian Rovo** ([[decisions/2026-05-18-rovo-replaces-jira-mcp]], [[modules/rovo-client]]). **Notion via MCP** ([[modules/mcp-clients]], Notion-only).
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd` (beads). TDD mandatory.

## Environment / setup status (personal account)
- `.env` at repo root (gitignored), validated green by `scripts/sanity_check.py` (standalone `uv` probe: OpenAI / Google OAuth / Atlassian / Notion).
- Google OAuth Web client live (redirect `localhost:8000/auth/google/callback`). GCP scope so far = project + APIs + OAuth only; VM/Terraform/Secret Manager deferred.
- **Deferred:** Google service-account + domain-wide delegation (no Workspace admin) → **blocks slice 3 (meetings)**; full GCP deploy. See `bd` memory `slice-3-meeting-participation-on-personal-municorn-no`.
- Notion transport will be self-hosted MCP / direct REST with static `ntn_` token, NOT the hosted OAuth endpoint.

## Backend status
- **Bootstrapped** (`ScrumAgent-9cg`, code done, container build pending Docker daemon). `backend/`: `app/{main,config,database,deps}.py`, `tests/` (8 green), `Dockerfile`, `requirements.txt` (lean), root `docker-compose.yml`. `GET /health` → `{"status":"ok"}`.
- Lean deps deliberate: deepagents/raganything/google/mcp added by their own module issues so the image always builds.
- Still `planned`: models, auth, llm, rag, rovo, mcp-notion, calendar, trace-store, orchestrator, 3 agents, routers, frontend wiring.

## Active Threads
- `ScrumAgent-7we` — prereqs (claimed; credential validation done, SA-key + GCP deferred).
- `ScrumAgent-9cg` — bootstrap (claimed; **code complete**, needs `docker compose up --build` confirmation once Docker Desktop is up).
- New follow-up: production frontend multi-stage Dockerfile (blocks GCP deploy `ScrumAgent-5hb`).
- `ScrumAgent-d5g` — P2 frontend review follow-ups (open).

## Next (value-first slice 1 = jira_notion)
Real path: `67j` models → `u2b` auth + `wqj` llm → thin orchestrator (`die`) routing to one agent → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent → minimal routers (`2jb`) → see staged-write on the frontend.
