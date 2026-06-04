---
type: meta
title: "Hot Cache"
updated: 2026-06-04T09:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-04. **Frontend auth UI hardened (`ScrumAgent-9pf`).** Sidebar-footer chip now shows the *real* signed-in user (name + avatar) with Sign out / Sign in, and any 401 clears the token and redirects to `/login` — killing the "Invalid or expired token" dead-end on **Projects** for users whose earlier login expired. **44/44 Playwright e2e green, tsc clean**, verified live against the running backend. On branch `main` (uncommitted at time of writing).

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose for Municorn (`@municorn.com`). Second deploy target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG) and `frontend` (Next.js 14 + TS at `apps/web/`).
- Three agents only: `meeting_participation`, `user_chat`, `jira_notion`. Orchestrator-mediated.
- LLM OpenAI-only, model **`gpt-5.4-mini`**. Jira via **Rovo**, Notion via **MCP**. Prod DB = **Cloud SQL Postgres**, local/tests = **SQLite**.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped — auth UI ([[modules/auth]] → *Frontend session*)
- **`apps/web/lib/auth.ts`** — added `logout()` (clear token → `/login`), `redirectToLogin()` (loop-guarded), and `decodeTokenEmail()` (unverified, display-only label from the JWT `email` claim).
- **`apps/web/lib/api.ts`** — `apiFetch` now treats **any 401** as expired/invalid: clears `localStorage["kabanchik.token"]` and redirects to `/login`. `ProjectsListLive` ignores 401 (no error flash on the way out).
- **`components/shell/UserMenu.tsx`** (new, wired into `Sidebar.tsx`) — replaces the hard-coded mock `alice`. Token present → initials avatar + real name (`/auth/me`), click → upward popover with email + **Sign out**. No token → **Sign in** → `/login`. Validates `/auth/me` on mount, so expired sessions bounce to login on app load.
- **Tests** — `tests/e2e/auth.spec.ts` (real-name, sign out, unauth Sign in, expired-token-on-Projects → `/login`); repaired stale `login.spec.ts` (button hands off to backend OAuth start, not mock route-home).

## Local dev environment (this session)
- Backend runs as a **local uvicorn** (`backend/.venv`), NOT Docker — Colima daemon was down. `DATABASE_URL=sqlite:////…/backend/.local/dev.db`. Frontend dev server on `:3000`, backend on `:8000`.
- Mint a dev JWT: `DATABASE_URL=… PYTHONPATH=. .venv/bin/python .local/_mint_dev_token.py` (seeds `dev@municorn.com` "Dev User", id 1).

## Open threads / housekeeping
- **`feat/project-creation-lb9` (ScrumAgent-lb9) still not pushed/merged** — 6 commits. This auth work was done on `main` on top of it; decide branch/merge order.
- Console shows benign **Fast Refresh** warnings ("Cannot update HotReload while rendering Sidebar") only during live edits — a clean reload adds none; not present in prod builds.
- Still open follow-ups: migrate the rest of the shell (project switcher, "Good morning, Alice", chat) off `mock-data.ts` to real APIs (`ScrumAgent-r0k`); Alembic for the 4 project tables (`ScrumAgent-soe`); email-invite for not-yet-signed-in members.

## Next
Commit/push the auth work (ScrumAgent-9pf) + the project-creation branch. Then resume value-first slice 1 backend: `wqj` LLM gateway → `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent → wire into real projects.
