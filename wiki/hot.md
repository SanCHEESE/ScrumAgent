---
type: meta
title: "Hot Cache"
updated: 2026-06-16T16:00:00+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-16. **DRY/altitude refactors from the code review (`ScrumAgent-iar`,
`-1yf`, `-7xk`, `-44x`, `-zis`).** The five cleanup findings the prior review filed
are now done — all behaviour-preserving. **Backend (`-1yf`)**: per-project access is
one FastAPI dependency, `require_project_access`, and the `agent_preview` see-all
bypass is one `can_access_all_projects` consulted by **both** that gate and
`list_projects` (no per-route `settings` plumbing, no duplicate bypass). **Frontend**:
a single `ProjectMeetingsProvider` (in `AppShell`) fans out each project's calendar
**once** for the Home stat/recent cards, the sidebar badge, and `/meetings` (`-iar`,
project set from `ActiveProjectProvider`, which now carries `color`);
`lib/calendar-date.ts` is the one all-day date parser (`-7xk`); `lib/avatar.ts` is the
one initials/colour/palette helper for `UserMenu`/`MembersSection`/`CalendarMeetingRow`
(`-44x`); `lib/use-current-user.ts` (`useCurrentUser`) is the one signed-in identity
resolver — after `-iar` removed the meetings consumers' token-gating, only the Home
greeting and `UserMenu` still need it (`-zis`). Gates green: backend `pytest` (148),
`tsc`, e2e (68 pass; the only reds are the known login/auth-vs-`dev:preview` env specs).

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
- **DRY/altitude refactors** (`iar`/`1yf`/`7xk`/`44x`/`zis`): single meetings
  fan-out provider, centralized backend project-access gate, and shared
  calendar-date / avatar / `useCurrentUser` helpers. See [[modules/calendar-sync]],
  [[modules/project-provisioning]], [[domains/frontend]] §Shared client helpers, `log.md`.
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
- Mock data still drives: meeting detail page, Home Jira/Notion stats, pending
  updates, agent activity, chat (`r0k`). Alembic pending (`soe`). `PendingOAuth`
  rows never expire (`2of`). `.gitignore` glob breaks `rg` (`n60`).
- Next value-first backend slice: `wqj` LLM gateway → `die` orchestrator →
  `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
