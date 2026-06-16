---
type: meta
title: "Hot Cache"
updated: 2026-06-16T11:47:31+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-16. **Home dashboard polish (`ScrumAgent-qiw`, `ScrumAgent-ec9`,
`ScrumAgent-9we`).** The Home page title no longer hardcodes
`Good morning, Alice`; it resolves the current user through `/auth/me` and
browser local time. Home **Recent meetings** now shows only scheduled future
calendar events, sorted soonest-first. The **Meetings this week** stat now reads
live project calendar events too: it counts current-week meetings and compares
against the previous week instead of rendering the old mock `12 / +3`.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG),
  `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**.
  Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped (same day, newest first)
- **Home Meetings this week stat** (`9we`): leading Home stat reads live project
  calendar events, counts the current week, and shows the delta vs previous week.
- **Home Recent meetings ordering** (`ec9`): card filters to future scheduled
  calendar events and sorts them by nearest start date ascending.
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
- Mock data still drives: meeting detail page, project switcher, Home Jira/Notion
  stats, pending updates, agent activity, chat (`ScrumAgent-r0k`). Alembic
  pending (`ScrumAgent-soe`). `PendingOAuth` rows still never expire.
- `ScrumAgent-n60` tracks the invalid `.gitignore` glob that makes `rg` print
  parse errors.
- Next value-first backend slice: `wqj` LLM gateway (must emit `llm_usage`) →
  `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
