---
type: module
title: "RAG"
path: "backend/app/rag.py"
language: python
status: planned
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
- Retrieve with normalized **citations** (source provenance).
- Enforce project-scoped filters for user-facing chat retrieval.
- Translate LightRAG responses into stable app-owned result shapes.
- Keep LightRAG storage/deployment details behind configuration.

## Runtime shape

LightRAG runs as a separate service container. The backend talks to it through
`app/rag.py` over HTTP. Local development uses a PostgreSQL service for LightRAG's
storage adapters; the GCP deployment uses Cloud SQL PostgreSQL through the same
adapter contract.

## API surface (small on purpose)

- `index_meeting(...)` — feed normalized, project-scoped meeting artifacts into
  the store.
- `retrieve(query, ...)` — return passages with citation metadata and scores.
- `status(project_id)` — support the Settings Knowledge base tab once the live UI
  is wired.

## Used by

- `meeting_participation` — indexes after analysis.
- `user_chat` — retrieves before answering.
- `/settings -> Knowledge base` — previews index health and retrieval quality.
