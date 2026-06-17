---
type: meta
title: "Hot Cache"
updated: 2026-06-17T08:58:14+04:00
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-17. **LightRAG ops foundation shipped (`ScrumAgent-qjh`).** Local
Compose now has `postgres`, `lightrag`, `backend`, and `frontend`. `lightrag` is
pinned to `ghcr.io/hkuds/lightrag:v1.5.3` on `:9621`; `postgres` uses
`gzdaniel/postgres-for-rag:pg18-age-pgvector` with a Postgres 18-compatible
`./data/postgres:/var/lib/postgresql` mount and explicit `platform: linux/amd64`
for Apple Silicon Docker Desktop. Only `lightrag` health-gates on `postgres`
(it needs the DB); `backend` and `frontend` use `service_started` ordering so a
RAG/DB problem can't block the whole app from starting (review fix `89a`). Smoke
verified all three infra/backend containers healthy, backend `/health`, and
backend-to-LightRAG `/health` over the Compose network.

## Key Recent Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Services: `backend` (FastAPI + DeepAgents + 3 agents + app adapters),
  `frontend` (Next.js 14), `lightrag` (multimodal RAG service), `postgres`
  (local LightRAG storage parity).
- RAG boundary: agents and routers must call only `backend/app/rag.py`
  ([[modules/rag]]). Backend settings are app-facing:
  `RAG_PROVIDER`, `LIGHTRAG_BASE_URL`, `LIGHTRAG_WORKSPACE`,
  `LIGHTRAG_TIMEOUT_SECONDS`, optional `LIGHTRAG_API_KEY`. LightRAG storage
  classes and `POSTGRES_*` stay container-side.
- LightRAG local storage adapters are PostgreSQL-backed:
  `PGKVStorage`, `PGDocStatusStorage`, `PGGraphStorage`, `PGVectorStorage`.
  GCP should point `LIGHTRAG_POSTGRES_*` at Cloud SQL PostgreSQL through private
  IP or Cloud SQL Auth Proxy.
- Docker daemon = Docker Desktop. In this shell, `docker-compose` v5.1.4 works;
  `docker compose ...` may be wrapper-sensitive. If pulls fail on
  `docker-credential-desktop`, using a temporary `DOCKER_CONFIG` plus
  `DOCKER_HOST=unix:///Users/abochkarev/.docker/run/docker.sock` worked.
- Quality gates today: backend `cd backend && .venv/bin/pytest -q`; Compose
  `docker-compose config --quiet`; frontend `npm --prefix apps/web run typecheck`.

## What just shipped (same day, newest first)
- **Review fixes on `qjh`** (`89a`): decoupled `backend`/`frontend` startup from
  RAG health (`service_started`, not `service_healthy`) so a LightRAG/Postgres
  problem no longer blocks the whole app; added `start_period` to the backend
  healthcheck; normalized blank `LIGHTRAG_API_KEY` to `None` (TDD). Follow-ups:
  GCP postgres override (`ebp`), deeper LightRAG readiness probe (`8w4`).
- **LightRAG local ops foundation** (`qjh`): Compose services, startup ordering,
  env template, backend config settings, Cloud SQL docs. Verification:
  backend pytest green, Compose config green, smoke stack healthy, backend
  reached LightRAG health and LightRAG reported PG storage adapters.
- **Suggested members / Settings → Members** (`idt`): full-stack member
  suggestions, batch add, pending invites, editable roles.
- **LightRAG multimodal RAG design**: separate LightRAG service, app-owned
  `app/rag.py` adapter, local Postgres storage parity, Cloud SQL on GCP.
- **DRY/altitude refactors** (`iar`/`1yf`/`7xk`/`44x`/`zis`): meetings fan-out
  provider, backend project-access gate, shared date/avatar/user helpers.

## Local dev environment
- Backend = local uvicorn (`backend/.venv`, port 8000, **no --reload**);
  frontend dev on `:3000`. Docker stack now also starts LightRAG and local RAG
  Postgres when using Compose.
- Frontend: `npm --prefix apps/web run dev:production` (real auth) /
  `dev:preview` (agent). Typecheck: `npm --prefix apps/web run typecheck`.
  Backend tests: `cd backend && .venv/bin/pytest -q`. e2e:
  `npm --prefix apps/web run e2e`.

## Open threads
- Next value-first backend slice is `ScrumAgent-o39`: implement `backend/app/rag.py`
  against LightRAG with fake-client TDD and keep agents off direct LightRAG APIs.
- Mock data still drives meeting detail page, Home Jira/Notion stats, pending
  updates, agent activity, chat (`r0k`). Alembic pending (`soe`). `PendingOAuth`
  rows never expire (`2of`) and pending member invite expiry remains open.
- `.gitignore` still has invalid leading `\` and breaks `rg` in default mode
  (`n60`); use `rg --no-ignore` or specific globs until fixed.
