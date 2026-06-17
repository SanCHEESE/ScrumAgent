---
type: meta
title: "Hot Cache"
updated: 2026-06-17T07:52:36+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-17. **RAG target changed to LightRAG multimodal service.** The original
RAG-Anything wording is now superseded: [[modules/rag]] remains the app-owned
adapter at `backend/app/rag.py`, but it will call a separate LightRAG service
container. Local testing uses PostgreSQL-backed LightRAG storage for parity; GCP
will point the same adapter at Cloud SQL PostgreSQL. First slice still indexes
meeting text artifacts (transcripts, summaries, decisions, actions, blockers) with
project-scoped citation metadata; multimodal ingestion is enabled by the service
boundary for screenshots, PDFs, Office docs, and images in later slices. Spec:
`docs/superpowers/specs/2026-06-17-lightrag-multimodal-rag-design.md`. Beads:
`ScrumAgent-o39` is the backend adapter issue; a new ops issue tracks the
LightRAG + local Postgres compose foundation.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Services: `backend` (FastAPI + DeepAgents + 3 agents + app adapters),
  `frontend` (Next.js 14 at `apps/web/`), plus planned `lightrag` and local
  `postgres` services for RAG.
- LLM OpenAI-only (`gpt-5.4-mini`). Jira via **Rovo**, Notion via **MCP**.
  Prod DB Cloud SQL Postgres; local app tests may stay SQLite, but RAG local
  parity uses PostgreSQL for LightRAG storage.
- Canonical plan: [[sources/mvp-v2-plan]]. Tracking: `bd`. TDD mandatory.
- Quality gates today: `tsc --noEmit` + Playwright e2e (no unit-test runner in
  `apps/web`); backend `pytest`. ESLint not configured.
- Project member = a registered `User` (hard FK). Email invites bridge the gap.

## What just shipped (same day, newest first)
- **Suggested members / Settings → Members** (`idt`): the above. Spec+plan in
  `docs/superpowers/{specs,plans}/2026-06-16-suggested-members*.md`.
- **LightRAG multimodal RAG design**: separate LightRAG service, app-owned
  `app/rag.py` adapter, local Postgres storage parity, Cloud SQL on GCP.
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
- Next value-first backend slice now needs the LightRAG ops foundation plus
  `o39` RAG adapter before `n6h` user_chat and `2bt` meeting_participation can
  consume retrieval/indexing.
