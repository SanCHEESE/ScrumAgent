---
type: meta
title: "Hot Cache"
updated: 2026-06-12T12:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-12. **OAuth audit fixes (`ScrumAgent-imt`) + live calendar meetings (`ScrumAgent-m5x`).** Both Google OAuth flows hardened end-to-end, and `/meetings` now shows *real* Google Calendar events from each project's agent account instead of mocks. Backend 85 pytest green, 47 Playwright e2e green, tsc clean, verified live in the browser (incl. a real `invalid_grant` → "reconnect" alert round-trip against Google).

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG), `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**. Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped

**OAuth fixes** ([[modules/auth]], [[modules/project-provisioning]]):
- Login callback: consent-cancel / exchange-failure / wrong-domain / unverified-email now 302 to `/login?error=<code>` (login page shows an alert) — was a raw 422/403 JSON dead-end. `email_verified` required in both callbacks.
- Agent-flow callback (`/projects/integrations/google/callback`): **always** renders the popup `postMessage` page, ok=false with `wrong_domain` / `no_refresh_token` / `exchange_failed` — the wizard no longer hangs on "Waiting…". Replay idempotent. `StepGoogle.tsx` also polls `popup.closed`.
- `get_current_user`: 401 (not 500) on non-numeric `sub`; rejects `purpose`-claim state JWTs (same signing key).
- `main.py` CORS origin now from `Settings.frontend_base_url` (.env honored), env-var fallback.

**Live meetings** ([[modules/calendar-sync]]):
- New `backend/app/google_calendar.py` — `GoogleCalendarClient.list_events(refresh_token, …)` (refresh→access token, primary-calendar `events.list`, `singleEvents`); `GoogleAuthRevokedError` on `invalid_grant`. Injectable via `deps.get_google_calendar`.
- `GET /projects/{id}/meetings?days_back&days_forward` (member-only; 409 grant missing/revoked → "reconnect the agent account", 502 upstream) → normalized events (all-day, attendees, Meet link, `htmlLink`).
- `/meetings` page rewritten: merges live events across all user projects; All/Upcoming/Past tabs; search; attendee initials avatars; Scheduled/Past pills; rows open the event in Google Calendar; per-project failures = inline alerts; no projects → "Create a project" hint. Detail page `/meetings/[id]` still mock (artifacts pipeline pending). Nothing persisted yet — endpoint proxies live.

## Local dev environment
- Backend = local uvicorn (`backend/.venv`), `DATABASE_URL=sqlite:////…/backend/.local/dev.db`, frontend dev on `:3000`. Mint dev JWT: `DATABASE_URL=… PYTHONPATH=. .venv/bin/python .local/_mint_dev_token.py`.
- Docker daemon = Docker Desktop (see bd memory `local-docker-daemon-colima`).

## Open threads
- ESLint is not configured in `apps/web` (`next lint` prompts interactively) — quality gates today are tsc + Playwright.
- Mock data still drives: meeting detail page, project switcher, home greeting, chat (`ScrumAgent-r0k`). Alembic pending (`ScrumAgent-soe`). `PendingOAuth` rows still never expire (minor hygiene, noted in ScrumAgent-imt).
- Next: value-first slice 1 backend — `wqj` LLM gateway → `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
