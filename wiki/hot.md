---
type: meta
title: "Hot Cache"
updated: 2026-06-16T11:31:54+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-16. **Home greeting identity/time fix (`ScrumAgent-qiw`).** The Home
page title no longer hardcodes `Good morning, Alice`; it resolves the current
user through `/auth/me` (with a JWT-email fallback while the request is pending)
and chooses `Good morning` / `Good afternoon` / `Good evening` from the browser's
local hour. In `agent_preview`, this means the visible Home title uses the local
fake dev user (`Dev User`, `dev@municorn.com`) without borrowing a production
token. The explicit preview/production split from `ScrumAgent-byz` remains:
production requires env-scoped bearer JWTs and member-only project access, while
agent preview can inspect all local projects.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG),
  `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**.
  Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped (same day, newest first)
- **Home greeting** (`qiw`): Home title now uses the current `/auth/me` user and
  browser time of day instead of hardcoded `Alice`.
- **Environment split** (`byz`): production vs agent preview mode, env-scoped JWT
  and token storage, preview all-project access without real bearer reuse.
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

## Local dev environment
- Backend = local uvicorn (`backend/.venv`, port 8000, **no --reload** —
  restart manually after backend changes), `DATABASE_URL=sqlite:////.../backend/.local/dev.db`,
  frontend dev on `:3000`. Mint dev JWT:
  `DATABASE_URL=... PYTHONPATH=. .venv/bin/python .local/_mint_dev_token.py`
  (prints the token environment). Seed billing demo data:
  `.local/_seed_billing.py` (idempotent, wipes `seed-%` rows).
- Frontend commands: `npm --prefix apps/web run dev:production` for real auth,
  `npm --prefix apps/web run dev:preview` for Codex/agent preview. For full-stack
  Compose preview, set `APP_ENVIRONMENT=agent_preview` locally only.
- Docker daemon = Docker Desktop (see bd memory `local-docker-daemon-colima`).

## Open threads
- ESLint is not configured in `apps/web` (`next lint` prompts interactively);
  quality gates today are tsc + Playwright.
- Mock data still drives: meeting detail page, project switcher, Home stats,
  pending updates, agent activity, chat (`ScrumAgent-r0k`). Alembic
  pending (`ScrumAgent-soe`). `PendingOAuth` rows still never expire.
- `ScrumAgent-n60` tracks the invalid `.gitignore` glob that makes `rg` print
  parse errors.
- Next value-first backend slice: `wqj` LLM gateway (must emit `llm_usage`) →
  `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
