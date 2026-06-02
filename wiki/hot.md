---
type: meta
title: "Hot Cache"
updated: 2026-06-02T18:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-02. **Production-ready project creation shipped full-stack (`ScrumAgent-lb9`).** New backend Project domain + agent Google offline-OAuth + Jira/Notion token validation + projects/users API; frontend Add Project wizard rewired to the real API. **71 backend pytest + 5 Playwright e2e green.** On branch `feat/project-creation-lb9` (6 commits), **not yet pushed/merged**.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose for Municorn (`@municorn.com`). Second deploy target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG) and `frontend` (Next.js 14 + TS at `apps/web/`).
- Three agents only: `meeting_participation`, `user_chat`, `jira_notion`. Orchestrator-mediated.
- LLM OpenAI-only, model **`gpt-5.4-mini`**. Jira via **Rovo**, Notion via **MCP**. Prod DB = **Cloud SQL Postgres**, local/tests = **SQLite**.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped — project creation ([[modules/project-provisioning]], [[decisions/2026-06-02-agent-google-offline-oauth]])
- **Models** (`app/models/project.py`): `Project`, `ProjectMember` (composite PK + role), `ProjectCredential` (1:1, Fernet secrets), `PendingOAuth` (one-shot agent-OAuth bridge).
- **Agent Google = offline OAuth** (refresh token, `calendar.events`), service-account/DWD deferred (no Workspace admin). Popup + signed `state` (`security/_state.py`) + `PendingOAuth` consumed at create. `get_agent_google_oauth` dep uses the project callback redirect.
- **Jira/Notion** (`app/integrations.py`): `IntegrationValidators` (httpx, injectable client_factory seam) + `parse_notion_page_id`. `/test` endpoints; **re-validated server-side at create (422)** if a token is provided; both skippable.
- **API** (`routers/projects.py` + `routers/users.py`): `POST/GET /projects`, `GET /projects/{id}` (404 for non-members), `GET /users/directory`. `agent_email` taken from the consented account, not the client. Secrets never returned.
- **Frontend** (`apps/web`): `lib/api.ts` (Bearer `apiFetch`); Step 2 editable agent email default `telecom.scrum.agent@municorn.com` + Authorize popup + hard gate; Step 3 Jira email+token+Test; Step 4 Notion token + **section link** + Test (fake DB picker gone); Step 5 **"Select team members"** multi-select from `/users/directory` (self excluded); `onCreate` → `POST /projects`; `/projects` list reads real data via `ProjectsListLive`. `StepInvite` removed.

## ⚠️ Deploy prerequisite (Google Cloud console)
Add the `calendar.events` scope to the consent screen + register redirect URI `{backend}/projects/integrations/google/callback`; the agent account must be able to sign in & consent. Without this the Authorize popup fails against real Google.

## Open threads / housekeeping
- **Branch `feat/project-creation-lb9` not pushed.** 6 commits (models → oauth → validators → api → frontend → e2e). Spec: `docs/superpowers/specs/2026-06-02-production-ready-project-creation-design.md`.
- **Still uncommitted, NOT mine** (left untouched): `docker-compose.yml`, `wiki/domains/deployment.md`, `.claude/*`. (I did commit the prior session's Colima entry in `wiki/log.md` alongside my session log.)
- New follow-ups to file: migrate shell (project switcher/chat/meetings) off `mock-data.ts` to real `/projects` (extends `ScrumAgent-r0k`); Alembic for the 4 new tables (`ScrumAgent-soe`); email-invite flow for not-yet-signed-in members.

## Next
Push `feat/project-creation-lb9` + open PR. Then resume value-first slice 1 backend: `wqj` LLM gateway → `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent → wire those into the now-real projects.
