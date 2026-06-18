---
type: module
title: "RAG"
path: "backend/app/rag.py"
language: python
status: partial
created: 2026-05-10
updated: 2026-06-18
depends_on: [llm-gateway]
used_by: [runtime-orchestrator, user_chat]
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
- `RAG_PIPELINE_POLL_SECONDS=1` / `RAG_PIPELINE_MAX_WAIT_SECONDS=120` /
  `RAG_PIPELINE_BUSY_RETRIES=5` — single-flight pipeline coordination (see API surface)

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

**Single-flight pipeline coordination (`ScrumAgent-srp`):** LightRAG's document
pipeline is single-flight and drains deletes asynchronously. `DELETE
/documents/delete_document` returns `200 {status:"deletion_started"}` while work is
still draining (and `200 {status:"busy"}` — *not* an HTTP error — when it scheduled
nothing); a `POST /documents/texts` arriving while a delete drains gets `HTTP 409`.
`_acquire/_release_destructive_busy` couple `pipeline_status.busy` with
`destructive_busy`, so the adapter polls `GET /documents/pipeline_status` until
`busy=false` to know a clear has fully drained. The client therefore:

- waits for idle before every delete batch and **retries** a `status:"busy"` delete
  (so re-syncs no longer silently drop batches — the original symptom was 308 docs
  but only 100 deleted);
- waits for the deletes to drain after `clear_project` returns;
- waits for idle before each insert and **retries on 409**, bounded by
  `RAG_PIPELINE_BUSY_RETRIES`.

Polling is bounded by `RAG_PIPELINE_POLL_SECONDS` / `RAG_PIPELINE_MAX_WAIT_SECONDS`;
exceeding the wait surfaces a `RagError` (a hard, visible run failure) rather than a
partial sync.

- `pipeline_busy()` — public one-shot probe of `pipeline_status.busy`. Ingestion
  calls it before a destructive resync/auto clear: if LightRAG is already busy with
  another job, the run is **deferred** instead of fighting the single-flight pipeline
  into a 120s timeout-then-`failed` (`ScrumAgent-vw3`; see [[flows/backlog-ingestion]]).

**Embedding throughput (`ScrumAgent-vw3`):** LightRAG's defaults (8 concurrent
embedding workers, 30s func / 60s worker timeout) overload OpenAI on a large backlog
— rate-limit backoff trips the worker timeout, FAILing docs and halting the pipeline
(observed: 493/2626 docs failed on a 2626-doc Jira backlog). The `lightrag` compose
service now defaults to `EMBEDDING_FUNC_MAX_ASYNC=2`, `EMBEDDING_TIMEOUT=180`,
`MAX_PARALLEL_INSERT=2` (all overridable via `LIGHTRAG_*` env) — slower but reliable;
raise on a higher OpenAI tier. To re-run only failed docs without a full re-fetch:
`POST /documents/reprocess_failed`.

### Implemented (read side — ScrumAgent-r0k / 2jb)

- `retrieve(project_id, question, k)` → `list[{text, score, citation{source_kind,
  source_id, title, source_uri}}]`  
  Calls LightRAG `/query` with `only_need_context=true` plus `include_references=true`
  and `include_chunk_content=true` (no LLM call inside LightRAG — we run our own
  grounded generation). LightRAG v1.5.3 returns
  `{response, references:[{reference_id, file_path, content:[chunk_text, ...]}]}`
  (shape confirmed live against `/openapi.json`, ScrumAgent-uzx — **not** the
  `{data:{chunks}}` the first cut assumed). `retrieve` reads `references`, joins each
  reference's `content` list into one passage, and **post-filters** to references
  whose `file_path` starts with `"{project_id}::"`.  
  - Drops any reference without a recognised citation (no usable `file_path` tag).
  - Drops references from other projects (cross-project leakage).
  - Passages keep LightRAG's returned relevance order. The response carries **no
    per-reference score**, so `score` is a `0.0` placeholder (list order is the
    ranking signal), not a similarity value.  
  This post-filter is the **anti-hallucination / no-leakage** guarantee: even though
  LightRAG's knowledge graph is shared across all projects, `retrieve` only ever
  surfaces passages provably tagged to the calling project — verified live, where a
  raw `/query` returned references spanning two projects and `retrieve` kept only the
  caller's.

- `clear_source(project_id, source_kind, source_id)` — exact-match delete of a
  single document (by the full `"{project_id}::{source_kind}::{source_id}"`
  `file_source` key). Used by the Remember write-back path to dedup before
  re-inserting a Q+A answer into the index (prevents duplicate passages from
  repeated "Remember" presses on the same message).

### Planned

- `index_meeting(...)` — feed normalized meeting artifacts (transcripts, summaries,
  decisions, action items) into the store. Tracked: `ScrumAgent-o39`.

## Used by

- `ingestion` — indexes Jira/Notion backlog documents on project creation and resync
  (see [[flows/backlog-ingestion]]).
- `meeting_participation` — will index after analysis (planned).
- `user_chat` — now live: calls `retrieve(project_id, question, k)` before every
  answer; calls `clear_source` + `index_documents` on the "Remember" write-back
  (see [[flows/chat]]).
- `/settings -> Knowledge base` — now live: real source counts + index health via
  `status()`, plus an auto-sync toggle and "Sync now" (resync) (`ScrumAgent-bah`).
