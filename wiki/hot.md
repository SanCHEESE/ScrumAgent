---
type: meta
title: "Hot Cache"
updated: 2026-06-17
tags: [meta, hot-cache]
---

# Recent Context

## Last Updated
2026-06-17. **Jira/Notion backlog ingestion into LightRAG shipped (`ScrumAgent-lcw`).**
When a project is created with Jira and/or Notion credentials, the existing backlog
is fetched and indexed into LightRAG as a non-blocking background job — chat and
agents have backlog context from day one. Manual admin re-sync supported.

## What just shipped (same day, newest first)
- **Backlog ingestion** (`lcw`): `RagClient` write path (`index_documents`,
  `clear_project`, `status`), `JiraReadClient` (paginated ADF→text),
  `NotionReadClient` (recursive block walk), `IngestionRun` model + `execute_run`
  (per-source error isolation), `IngestionRunner` (GC-safe background task), create-
  time trigger (non-blocking), `GET /{id}/knowledge-base/status` (members),
  `POST /{id}/knowledge-base/resync` (admin-only). 192 backend tests passing.
  Text-only; images, auto-sync, and chat-side retrieval deferred (`n6h`).
- **Review fixes on `qjh`** (`89a`): decoupled `backend`/`frontend` startup from
  RAG health (`service_started`, not `service_healthy`) so a LightRAG/Postgres
  problem can't block the whole app; added `start_period` to the backend
  healthcheck; normalized blank `LIGHTRAG_API_KEY` to `None` (TDD). Follow-ups:
  GCP postgres override (`ebp`), deeper LightRAG readiness probe (`8w4`).
- **LightRAG local ops foundation** (`qjh`): Compose services, startup ordering,
  env template, backend config settings, Cloud SQL docs.
- **Suggested members / Settings → Members** (`idt`): full-stack member
  suggestions, batch add, pending invites, editable roles.

## Key Architecture Facts
- Project: **Telecom Scrum Agent**, branded **Kabanchik**. Local-first Docker
  Compose for Municorn (`@municorn.com`); second target = single GCE VM.
- Services: `backend` (FastAPI + DeepAgents + 3 agents + app adapters),
  `frontend` (Next.js 14), `lightrag` (multimodal RAG service, v1.5.3, port 9621),
  `postgres` (local LightRAG storage parity).
- RAG boundary: all code must call only `backend/app/rag.py` ([[modules/rag]]).
  Agents and routers never touch LightRAG directly.
- **RAG write path now live.** `RagClient` implements `index_documents`,
  `clear_project`, and `status`. Project isolation uses the `file_source` tag
  `"{project_id}::{source_kind}::{source_id}"` — LightRAG v1.5.3 shares a single
  knowledge graph, so this is reference-level only, not graph-level
  (`ScrumAgent-o39`). Re-sync = delete-by-prefix then reinsert (no upsert in
  LightRAG v1.5.3).
- `retrieve` and `index_meeting` remain planned (`ScrumAgent-n6h`, `o39`).
- Backend settings (app-facing): `RAG_PROVIDER`, `LIGHTRAG_BASE_URL`,
  `LIGHTRAG_WORKSPACE`, `LIGHTRAG_TIMEOUT_SECONDS`, optional `LIGHTRAG_API_KEY`.
  LightRAG storage classes and `POSTGRES_*` stay container-side.
- LightRAG local storage adapters: `PGKVStorage`, `PGDocStatusStorage`,
  `PGGraphStorage`, `PGVectorStorage`. GCP points `LIGHTRAG_POSTGRES_*` at Cloud
  SQL PostgreSQL via private IP or Cloud SQL Auth Proxy.
- Docker daemon = Docker Desktop. `docker-compose` v5.1.4 in this shell;
  if credential errors arise use a temporary `DOCKER_CONFIG` +
  `DOCKER_HOST=unix:///Users/abochkarev/.docker/run/docker.sock`.

## Local dev environment
- Backend: local uvicorn (`backend/.venv`, port 8000, **no --reload**); tests:
  `cd backend && .venv/bin/pytest -q`.
- Frontend: `npm --prefix apps/web run dev:production` (real auth) /
  `dev:preview` (agent). Typecheck: `npm --prefix apps/web run typecheck`.
  e2e: `npm --prefix apps/web run e2e`.
- Docker stack: `docker-compose up` starts postgres, lightrag, backend, frontend.
  Only `lightrag` health-gates on `postgres`; `backend`/`frontend` use
  `service_started` ordering.

## Open threads
- RAG retrieve path (`ScrumAgent-n6h`) and `index_meeting` (`ScrumAgent-o39`) are
  the next RAG slices.
- Single shared LightRAG instance / knowledge graph: project isolation is only at
  the `file_source` reference level (`ScrumAgent-o39`).
- Mock data still drives meeting detail, Home Jira/Notion stats, pending updates,
  agent activity, chat (`r0k`). Alembic pending (`soe`). `PendingOAuth` rows never
  expire (`2of`) and pending member invite expiry open.
- `.gitignore` invalid leading `\` breaks `rg` in default mode (`n60`); use
  `rg --no-ignore` or specific globs until fixed.
