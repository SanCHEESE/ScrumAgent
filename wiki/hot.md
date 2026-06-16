---
type: meta
title: "Hot Cache"
updated: 2026-06-16T13:05:00+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-16. **Preview vs production environments (`ScrumAgent-byz`).** Runtime
access is now explicitly split with `APP_ENVIRONMENT` / `NEXT_PUBLIC_APP_ENVIRONMENT`.
Default `production` is real-use mode: protected backend routes require bearer
JWTs, project access stays member-only, and frontend sessions use
`localStorage["kabanchik.production.token"]`. `agent_preview` is only for local
Codex/agent previews: the backend can resolve a local preview principal without a
bearer and project endpoints can inspect all projects; the frontend uses
`kabanchik.agent_preview.token`, clears legacy/foreign token keys on login, and
shows the local fake dev user (`Dev User`, `dev@municorn.com`) via `/auth/me`
without bearer. Real OAuth JWTs now carry an `env` claim and missing/wrong-
environment tokens 401, so preview and real sessions do not mix.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG),
  `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**.
  Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped (same day, newest first)
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
- Mock data still drives: meeting detail page, project switcher, Home greeting
  and stats, pending updates, agent activity, chat (`ScrumAgent-r0k`). Alembic
  pending (`ScrumAgent-soe`). `PendingOAuth` rows still never expire.
- `ScrumAgent-n60` tracks the invalid `.gitignore` glob that makes `rg` print
  parse errors.
- Next value-first backend slice: `wqj` LLM gateway (must emit `llm_usage`) →
  `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
