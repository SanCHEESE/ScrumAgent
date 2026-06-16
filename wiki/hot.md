---
type: meta
title: "Hot Cache"
updated: 2026-06-16T13:30:00+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-16. **Code-review fixes on the live-data work (`ScrumAgent-y6a`,
`ScrumAgent-oqo`, `ScrumAgent-hky`, `ScrumAgent-02t`).** A review of the
2026-06-15/16 commits found correctness bugs in the freshly shipped Home/meetings
live data; fixed via four parallel agents + one integration fix. Meetings counts
now dedup events by id and use DST-safe week bounds, and surface partial fetch
failures instead of silently under-reporting. The Recent meetings card
distinguishes empty / needs-connection (409) / hard error, drops cancelled
events, and dedups rows. The Home greeting is hydration-safe (computed post-mount)
and `ActiveProjectProvider` now exposes a `loading/ready/error` status so the Home
subtitle and the sidebar switcher show a real error affordance instead of the
"No project selected" sentinel on a `GET /projects` failure. Backend:
`_ensure_preview_user` tolerates concurrent inserts/dupes and `_serialize` skips
orphaned memberships. Compose now honors the documented `NEXT_PUBLIC_APP_ENVIRONMENT`
knob. Five cleanup/altitude findings were filed (see Open threads).

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG),
  `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**.
  Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.
- Quality gates today: `tsc --noEmit` + Playwright e2e (no unit-test runner in
  `apps/web`); backend `pytest`. ESLint not configured.

## What just shipped (same day, newest first)
- **Code-review fixes** (`y6a`/`oqo`/`hky`/`02t`): see Last Updated. Details in
  [[modules/calendar-sync]] "Hardening (2026-06-16 code review)" and `log.md`.
- **Upload recording disabled** (`dik`): `/meetings` Upload CTA shown but disabled
  until the import flow exists.
- **SVG brand mark** (`qe6`): sidebar logo + favicon use `kabanchik-boar.svg`.
- **Sidebar direct logout** (`fv7`): footer row is a direct logout button; logout
  clears all app token keys.
- **Meetings nav badge** (`cv3`): badge derived from live current-week count.
- **Shell project switcher** (`iie`): active project from real `GET /projects`.
- **Home Meetings this week stat** (`9we`) + **Recent meetings** (`ec9`/`0i6`):
  live calendar events; greeting personalized (`qiw`).
- **Environment split** (`byz`): production vs agent_preview, env-scoped JWT +
  token storage, preview all-project access.
- **Members/Billing/Integrations/Agent settings** (`l5p`/`307`/`d9q`/`7qy`): live.

## Local dev environment
- Backend = local uvicorn (`backend/.venv`, port 8000, **no --reload** — restart
  manually), `DATABASE_URL=sqlite:////.../backend/.local/dev.db`. Frontend dev on
  `:3000`. NOTE: the running `:3000` server may be `dev:preview` (agent_preview) —
  `login`/`auth` e2e specs assume production, so they fail against a preview
  server (not a code bug). Mint dev JWT: `.local/_mint_dev_token.py`. Seed billing:
  `.local/_seed_billing.py`.
- Frontend: `npm --prefix apps/web run dev:production` (real auth) /
  `dev:preview` (agent). Typecheck: `npm --prefix apps/web run typecheck`.
  e2e: `npm --prefix apps/web run e2e` (Playwright reuses an existing `:3000`).
- Docker daemon = Docker Desktop (bd memory `local-docker-daemon-colima`); may be
  off (so `docker compose config` won't render).

## Open threads
- **Cleanup/altitude refactors from the review** (filed, not done): `iar` shared
  per-project meetings fan-out hook; `1yf` centralize agent_preview see-all bypass;
  `7xk` shared calendar date-parse helper; `44x` unify avatar helpers; `zis`
  centralize signed-in-user resolution.
- Mock data still drives: meeting detail page, Home Jira/Notion stats, pending
  updates, agent activity, chat (`r0k`). Alembic pending (`soe`). `PendingOAuth`
  rows never expire (`2of`). `.gitignore` glob breaks `rg` (`n60`).
- Next value-first backend slice: `wqj` LLM gateway → `die` orchestrator →
  `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
