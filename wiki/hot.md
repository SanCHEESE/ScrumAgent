---
type: meta
title: "Hot Cache"
updated: 2026-06-15T05:45:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-15. **Live /settings Members tab (`ScrumAgent-l5p`).** Reviewed project settings: Agent behavior (`7qy`), Integrations (`d9q`), and Billing (`307`) were already live. Members is now wired to `GET /projects` with a project picker and real `ProjectOut.members`; no hardcoded Alice/Bob list. Remaining mock-only tabs are tracked as `ScrumAgent-sxm` (Knowledge base) and `ScrumAgent-0r1` (Notifications). `ScrumAgent-n60` tracks the invalid `.gitignore` glob that makes `rg` print parse errors.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG), `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**. Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped (same day, newest first)
- **Members settings** (`l5p`): live project picker + real member table from existing project API; focused settings e2e added.
- **Billing settings** (`307`): see above. Playwright `mockSettingsApi` now installs default routes for all live tabs (billing/integrations) so nav-only tests don't leak requests to a real backend.
- **Integrations settings** (`d9q`): real per-project status + configure/test endpoints, Google reconnect via staged `PendingOAuth`. See [[modules/project-provisioning]].
- **Per-project agent settings** (`7qy`): `project_agent_settings` + GET/PUT; picker + debounced autosave.
- **Live meetings** (`m5x`): `GET /projects/{id}/meetings`; revoked grant → 409 + `google_connected=false`.

## Local dev environment
- Backend = local uvicorn (`backend/.venv`, port 8000, **no --reload** — restart manually after backend changes), `DATABASE_URL=sqlite:////…/backend/.local/dev.db`, frontend dev on `:3000`. Mint dev JWT: `DATABASE_URL=… PYTHONPATH=. .venv/bin/python .local/_mint_dev_token.py`. Seed billing demo data: `.local/_seed_billing.py` (idempotent, wipes `seed-%` rows).
- Docker daemon = Docker Desktop (see bd memory `local-docker-daemon-colima`).

## Open threads
- ESLint is not configured in `apps/web` (`next lint` prompts interactively) — quality gates today are tsc + Playwright.
- Mock data still drives: meeting detail page, project switcher, home greeting, chat (`ScrumAgent-r0k`). Alembic pending (`ScrumAgent-soe`). `PendingOAuth` rows still never expire.
- Next: value-first slice 1 backend — `wqj` LLM gateway (now must also emit `llm_usage` rows) → `die` orchestrator → `qor` Rovo + `ilz` Notion MCP → `2u9` jira_notion agent.
