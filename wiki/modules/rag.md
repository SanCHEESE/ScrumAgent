---
type: module
title: "RAG"
path: "backend/app/rag.py"
language: python
status: partial
created: 2026-05-10
updated: 2026-06-17
depends_on: [llm-gateway]
used_by: [runtime-orchestrator]
tags: [module, rag]
---

# RAG (`rag.py`)

App-owned wrapper around [[concepts/lightrag-multimodal]]. Agents and routers call
this module, never LightRAG directly.

## Responsibilities

- Index transcripts, summaries, decisions, action items, and later multimodal
  meeting artifacts such as screen captures or linked documents.
- Index backlog documents fetched from Jira and Notion at project creation.
- Retrieve with normalized **citations** (source provenance).
- Enforce project-scoped filters for user-facing chat retrieval.
- Translate LightRAG responses into stable app-owned result shapes.
- Keep LightRAG storage/deployment details behind configuration.

## Runtime shape

LightRAG runs as a separate service container. The backend talks to it through
`app/rag.py` over HTTP. Local development uses a PostgreSQL service for LightRAG's
storage adapters; the GCP deployment uses Cloud SQL PostgreSQL through the same
adapter contract.

## Configuration boundary

Backend settings stay app-level:

- `RAG_PROVIDER=lightrag`
- `LIGHTRAG_BASE_URL=http://lightrag:9621`
- `LIGHTRAG_WORKSPACE=scrumagent`
- `LIGHTRAG_TIMEOUT_SECONDS=10`
- optional `LIGHTRAG_API_KEY`

LightRAG storage settings (`PGKVStorage`, `PGVectorStorage`, `PGGraphStorage`,
`PGDocStatusStorage`, and `POSTGRES_*`) are container-side deployment config, not
agent/backend module config.

## API surface

### Implemented (write side — ScrumAgent-lcw)

- `index_documents(project_id, docs)` — batch `POST /documents/texts` to LightRAG,
  used by the backlog ingestion pipeline.
- `clear_project(project_id)` — delete all documents whose `file_source` starts
  with `"{project_id}::"` before a re-sync; LightRAG v1.5.3 has no per-doc metadata
  or upsert, so delete-then-reinsert is the only safe re-sync path (used by both
  manual `resync` and periodic `auto` syncs — see [[flows/backlog-ingestion]]).
- `status(project_id)` — project-scoped document counts, both `by_status`
  (LightRAG processing state) and `by_source_kind` (parsed from the middle segment
  of `file_source`, i.e. jira/notion/…); backs the
  `GET /projects/{id}/knowledge-base/status` endpoint and the live Settings →
  Knowledge base source counts.

**Project scoping:** LightRAG v1.5.3 has a single shared instance and workspace, so
project isolation is encoded in the `file_source` field:
`"{project_id}::{source_kind}::{source_id}"`. This is a reference-level tag, not a
graph-level boundary — the knowledge graph itself is shared across projects (known
limitation, tracked as `ScrumAgent-o39`).

### Planned

- `index_meeting(...)` — feed normalized meeting artifacts (transcripts, summaries,
  decisions, action items) into the store. Tracked: `ScrumAgent-o39`.
- `retrieve(query, ...)` — return passages with citation metadata and scores.
  Tracked: `ScrumAgent-n6h`.

## Used by

- `ingestion` — indexes Jira/Notion backlog documents on project creation and resync
  (see [[flows/backlog-ingestion]]).
- `meeting_participation` — will index after analysis (planned).
- `user_chat` — will retrieve before answering (planned).
- `/settings -> Knowledge base` — now live: real source counts + index health via
  `status()`, plus an auto-sync toggle and "Sync now" (resync) (`ScrumAgent-bah`).
