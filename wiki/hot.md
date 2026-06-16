---
type: meta
title: "Hot Cache"
updated: 2026-06-16T09:11:15+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-16. **Live Home Recent meetings (`ScrumAgent-0i6`).** Home's Recent
meetings card now reads real Google Calendar data instead of
`MEETINGS.slice(0, 3)`. New `RecentMeetingsLive` fetches `GET /projects`, then
each project's `GET /projects/{id}/meetings`, merges the results, sorts by event
start descending, and shows the newest three calendar events. Rows render real
date/month, attendee count, duration, project name, Scheduled/Past status, and
open the Google Calendar `html_link` when available. The widget skips fetching
when no decodable bearer JWT exists, so optional calendar loading does not
redirect unauthenticated shell/tweaks views. Loading/empty/error states stay
inside the card. The old mock `Daily Standup` row is covered by a Playwright
regression.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG),
  `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**.
  Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped (same day, newest first)
- **Home Recent meetings** (`0i6`): live calendar events on Home via the same
  project meetings endpoint as `/meetings`; focused e2e added, tsc clean,
  browser-verified against real local calendar rows.
- **Members settings** (`l5p`): live project picker + real member table from
  existing project API; focused settings e2e added.
- **Billing settings** (`307`): live `/billing` aggregation from `llm_usage`;
  Playwright settings API mocks isolate live tabs.
- **Integrations settings** (`d9q`): real per-project Google/Jira/Notion status,
  configure/test endpoints, and Google reconnect via staged `PendingOAuth`.
- **Per-project agent settings** (`7qy`): `project_agent_settings` + GET/PUT;
  picker + debounced autosave.
- **Live meetings** (`m5x`): `GET /projects/{id}/meetings`; revoked grant →
  409 + `google_connected=false`.

## Local dev environment
- Backend = local uvicorn (`backend/.venv`, port 8000, **no --reload** —
  restart manually after backend changes), `DATABASE_URL=sqlite:////.../backend/.local/dev.db`,
  frontend dev on `:3000`. Mint dev JWT:
  `DATABASE_URL=... PYTHONPATH=. .venv/bin/python .local/_mint_dev_token.py`.
  Seed billing demo data: `.local/_seed_billing.py` (idempotent, wipes `seed-%`
  rows).
- Docker daemon = Docker Desktop (see bd memory `local-docker-daemon-colima`).

## Open threads
- ESLint is not configured in `apps/web` (`next lint` prompts interactively);
  quality gates today are tsc + Playwright.
- Mock data still drives: meeting detail page, project switcher, Home greeting
  and stats, pending updates, agent activity, chat (`ScrumAgent-r0k`). Alembic
  pending (`ScrumAgent-soe`). `PendingOAuth` rows still never expire.
- `ScrumAgent-n60` tracks the invalid `.gitignore` glob that makes `rg` print
  parse errors.
- Next value-first backend slice: `wqj` LLM gateway (must emit `llm_usage`) →
  `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
