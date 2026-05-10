---
type: module
title: "RAG"
path: "backend/app/rag.py"
language: python
status: planned
created: 2026-05-10
updated: 2026-05-10
depends_on: [llm-gateway]
used_by: [runtime-orchestrator]
tags: [module, rag]
---

# RAG (`rag.py`)

App-owned wrapper around [[concepts/rag-anything]].

## Responsibilities

- Index transcripts, summaries, decisions, action items.
- Retrieve with normalized **citations** (source provenance).
- Persist under `RAG_STORAGE_PATH` (`/data/rag` by default).

## API surface (small on purpose)

- `index_meeting(...)` — feed normalized meeting artifacts into the store.
- `retrieve(query, ...)` — return passages with citation metadata.

## Used by

- `meeting_participation` — indexes after analysis.
- `user_chat` — retrieves before answering.
