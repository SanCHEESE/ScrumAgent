---
type: meta
title: "Hot Cache"
updated: 2026-06-12T18:00:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-12. **Live /settings Billing tab (`ScrumAgent-307`).** Billing is no longer mock. New `llm_usage` table (`app/models/usage.py`): one row per provider call — project_id, `run_id` (groups one agent invocation), `context` label, provider/model/`kind` (llm|stt|embed)/`category` (orchestrator|subagents|whisper|embeddings|storage), input/output units (M tok or STT min), `cost_usd`. **The LLM gateway (`wqj`) must write these rows**; until then real projects show honest zeros/empty states. New member-only `GET /projects/{id}/billing` aggregates the current calendar month in Python: MTD + linear projection (mtd/days_elapsed×days_in_month), per-category costs, per-model usage with 10-day daily sparkline, 6 most recent run-grouped invocations. Frontend `BillingSection` rewritten: project picker, live fetch, empty states; `ApiKeysTable` + `billing-mock.ts` deleted (no budget config exists → hero bar is spent-vs-projected, no fake invoices/keys). Dev seed: `backend/.local/_seed_billing.py`. 131 pytest green (9 new), 58 Playwright green, tsc clean, verified live against seeded dev data.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Two services: `backend` (FastAPI + DeepAgents + 3 agents + DB + RAG), `frontend` (Next.js 14 at `apps/web/`).
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**. Prod DB Cloud SQL Postgres, local/tests SQLite.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.

## What just shipped (same day, newest first)
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
