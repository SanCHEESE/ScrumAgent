---
type: meta
title: "Hot Cache"
updated: 2026-06-16T18:30:00+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-16. **Suggested members + batch-add + editable roles in Settings → Members
(`ScrumAgent-idt`).** `/settings → Members` is now read-**write**, full-stack. A
**Suggested members** section lists the project agent's meeting participants (live
Google Calendar, via the existing `_participant_suggestions`, minus the agent/current
members/existing invites); you multi-select and **Add selected (N)** as a batch
(default role `member`), then edit roles in **Team members** (inline viewer/member/admin
`<select>`s). People with **no account** are persisted as **email invitations**
(`PendingProjectMember(project_id,email,role)` — a new table, *not* a nullable
`ProjectMember.user_id`) and become real `ProjectMember`s on their **first Google login**
via `grant_pending_memberships` (new `app/membership.py`, called in `auth.py`
`google_callback` every login, idempotent, never downgrades). `ProjectOut` gained an
additive `pending_members[]`. New endpoints (all under `require_project_access`):
`GET /{id}/member-suggestions`, `POST /{id}/members` (batch), `PATCH /{id}/members/{user_id}`,
`PATCH /{id}/pending-members/{email}`. Gates: backend **pytest 170** (22 new), **tsc**
clean. Browser data-flow check was CORS-blocked (preview forced off `:3000`, backend
allows `:3000` only) — Members tab confirmed to mount without runtime error; full flow
verifiable on the user's own `:3000`. Deferred (filed): admin-only gating, member/invite
removal, invite expiry. See [[modules/project-provisioning]] §Settings → Members, `log.md`.

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
- Project member = a registered `User` (hard FK). Email invites bridge the gap.

## What just shipped (same day, newest first)
- **Suggested members / Settings → Members** (`idt`): the above. Spec+plan in
  `docs/superpowers/{specs,plans}/2026-06-16-suggested-members*.md`.
- **DRY/altitude refactors** (`iar`/`1yf`/`7xk`/`44x`/`zis`): single meetings
  fan-out provider, centralized backend project-access gate (`require_project_access`
  + `can_access_all_projects`), shared calendar-date / avatar / `useCurrentUser`
  helpers. See [[modules/calendar-sync]], [[modules/project-provisioning]], [[domains/frontend]].
- **Code-review fixes** (`y6a`/`oqo`/`hky`/`02t`); **Upload disabled** (`dik`);
  **SVG brand mark** (`qe6`); **Sidebar direct logout** (`fv7`); **Meetings nav
  badge** (`cv3`); **Shell project switcher** (`iie`); **Home Meetings stat**
  (`9we`) + **Recent meetings** (`ec9`/`0i6`); **Env split** (`byz`);
  **Members/Billing/Integrations/Agent settings** (`l5p`/`307`/`d9q`/`7qy`).

## Local dev environment
- Backend = local uvicorn (`backend/.venv`, port 8000, **no --reload** — restart
  manually), `DATABASE_URL=sqlite:////.../backend/.local/dev.db`. Frontend dev on
  `:3000` (user-run; the preview MCP can't attach to it and a fresh preview lands on a
  random port → CORS-blocked against the `:3000`-only backend allowlist). NOTE: the
  running `:3000` may be `dev:preview` (agent_preview, see-all). Mint dev JWT:
  `.local/_mint_dev_token.py`. Seed billing: `.local/_seed_billing.py`.
- Frontend: `npm --prefix apps/web run dev:production` (real auth) /
  `dev:preview` (agent). Typecheck: `npm --prefix apps/web run typecheck`.
  Backend tests: `cd backend && .venv/bin/pytest -q`. e2e: `npm --prefix apps/web run e2e`.
- Docker daemon = Docker Desktop (bd memory `local-docker-daemon-colima`); may be off.

## Open threads
- Mock data still drives: meeting detail page, Home Jira/Notion stats, pending
  updates, agent activity, chat (`r0k`). Alembic pending (`soe`). `PendingOAuth`
  rows never expire (`2of`) — same gap now for `PendingProjectMember` invites.
  `.gitignore` glob breaks `rg` (`n60`).
- Member-management follow-ups: removal, admin-only gating, invite expiry.
- Next value-first backend slice: `wqj` LLM gateway → `die` orchestrator →
  `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
