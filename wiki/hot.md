---
type: meta
title: "Hot Cache"
updated: 2026-06-12T16:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-12. **Live /settings Integrations tab (`ScrumAgent-d9q`).** The Integrations tab now shows the real per-project state and can configure + test endpoints: `GET /projects/{id}/integrations` (status, never secrets), `PUT …/integrations/jira|notion` (live-validate → save, 422 keeps old creds), `PUT …/integrations/google` (reconnect via staged `PendingOAuth` — recovery path for the meetings 409), `POST …/integrations/{provider}/test` (probes **stored** creds; google = 1-event calendar probe flipping `google_connected` both ways). Frontend rewritten: project picker, real badges, inline configure forms, Test buttons, Google Reconnect popup. OpenAI/Slack mock cards dropped. 122 pytest green, 58 Playwright green, tsc clean, verified live (Jira + Google stored-cred probes OK against real services). Earlier same day: per-project Agent behavior settings (`7qy`), OAuth audit fixes (`imt`), live calendar meetings (`m5x`), live project-card counts (`0dx`).

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG), `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**. Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped

**Integrations settings** ([[modules/project-provisioning]]):
- Status model: google `{connected, agent_email}` (connected = flag AND stored refresh token), jira `{configured, site_url, user_email, project_key}` (configured = site + token), notion `{configured, section_url, page_id}` (configured = token). Secrets never serialized.
- Jira/Notion PUT re-uses `IntegrationValidators` (same as wizard/create): invalid creds → 422, stored values untouched. Notion section URL re-parsed to `page_id`.
- Google reconnect = wizard popup handshake (`/projects/integrations/google/start` + postMessage) then `PUT /{id}/integrations/google` consuming the `PendingOAuth` row (one-shot, owner-checked).
- `IntegrationsSection.tsx`: per-project via picker; new CSS `.integration-card-block` / `.integration-form` in `styles/screens/settings.css`.

**Per-project agent settings** (`7qy`): `project_agent_settings` table + `GET/PUT /projects/{id}/settings/agent`; picker + debounced autosave.

**Live meetings** (`m5x`): `GoogleCalendarClient.list_events` + `GET /projects/{id}/meetings`; `/meetings` page live; revoked grant → 409 + `google_connected=false`.

## Local dev environment
- Backend = local uvicorn (`backend/.venv`, port 8000, **no --reload** — restart manually after backend changes), `DATABASE_URL=sqlite:////…/backend/.local/dev.db`, frontend dev on `:3000`. Mint dev JWT: `DATABASE_URL=… PYTHONPATH=. .venv/bin/python .local/_mint_dev_token.py`.
- Docker daemon = Docker Desktop (see bd memory `local-docker-daemon-colima`).

## Open threads
- ESLint is not configured in `apps/web` (`next lint` prompts interactively) — quality gates today are tsc + Playwright.
- Mock data still drives: meeting detail page, project switcher, home greeting, chat (`ScrumAgent-r0k`). Alembic pending (`ScrumAgent-soe`). `PendingOAuth` rows still never expire (minor hygiene; reconnect flow now also stages them).
- Next: value-first slice 1 backend — `wqj` LLM gateway → `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
