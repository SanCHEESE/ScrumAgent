---
type: meta
title: "Hot Cache"
updated: 2026-05-22T12:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-05-22. New visual: [[flows/gcp-deployment-topology]] — Mermaid connectivity diagram for the GCE deploy (edge / VM / state / control plane + external integrations). Backend implementation about to start; scope unchanged from 2026-05-18 (Rovo for Jira, single Compute Engine VM).

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose service for Municorn (`@municorn.com`). GCP deploy added as a second target (single GCE VM) — see [[decisions/2026-05-18-gcp-compute-engine-deployment]].
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + SQLite + RAG-Anything) and `frontend` (Next.js 14 + TypeScript at `apps/web/`).
- Three agents only: `meeting_participation`, `user_chat`, `jira_notion`. No agent-to-agent calls outside the orchestrator.
- LLM is OpenAI-only via `langchain-openai`. RAG is RAG-Anything.
- **Jira via Atlassian Rovo** (direct vendor integration, not MCP) — see [[decisions/2026-05-18-rovo-replaces-jira-mcp]] and [[modules/rovo-client]].
- **Notion via MCP** (unchanged) — [[modules/mcp-clients]] is now Notion-only.
- Canonical execution plan: [[sources/mvp-v2-plan]]. Issue tracking: `bd` (beads).

## Backend status
- Not started. Only `apps/web/` exists. All backend modules listed in [[modules/_index]] are `planned`.
- Beads work queue laid out 2026-05-18: bootstrap → models → 6 parallel modules (auth, llm, rag, rovo, mcp-notion, calendar) → trace-store → orchestrator → 3 agents → routers → frontend wiring. GCE provisioning is parallel to all backend work.

## GCP deploy shape (one VM, lift-and-shift Compose)
- `e2-standard-2` VM + 100 GB persistent SSD at `/opt/scrumagent/data/` (holds `db/`, `rag/`, `keys/`).
- Caddy fronts 8000/3000 with Let's Encrypt.
- Secret Manager → `.env` + `sa_key.json` at boot.
- Static IP + Cloud DNS. Daily disk snapshot.
- New env block: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_ZONE`, `PUBLIC_HOSTNAME`, `LETSENCRYPT_EMAIL`, `SM_*` secret refs. Same `GOOGLE_CLIENT_ID/SECRET` reused; OAuth callback gets a second authorized URI under `${PUBLIC_HOSTNAME}`.

## Rovo migration cheatsheet
- Removed env: `ATLASSIAN_MCP_URL`, `ATLASSIAN_API_TOKEN`.
- Added env: `ROVO_BASE_URL`, `ROVO_API_TOKEN`, `ATLASSIAN_SITE_URL`, `ATLASSIAN_USER_EMAIL`.
- New backend module: `backend/app/rovo_client.py` ([[modules/rovo-client]]).
- `backend/app/mcp_clients.py` becomes Notion-only.
- `jira_notion` agent uses two transports internally (Rovo + Notion MCP). Capability boundary unchanged.

## Frontend
- `apps/web/`, Next.js 14 App Router, TypeScript strict, Tailwind utility-only. 12 routes built, mocks in `apps/web/lib/mock-data.ts`. Playwright 38/38 green.
- Frontend-backend wiring is a separate beads task (`ScrumAgent-r0k`), blocked on routers.

## Active Threads
- Open: `ScrumAgent-d5g` — P2 frontend review follow-ups.
- Open: `ScrumAgent-7we` — prereqs (Rovo + GCP credentials, ops setup).
- Open: `ScrumAgent-9cg` — backend bootstrap (unblocks 6 parallel modules).
- Open backend chain: bootstrap → models → modules → orchestrator → agents → routers → frontend wiring.
