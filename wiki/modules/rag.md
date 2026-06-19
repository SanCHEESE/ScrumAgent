---
type: module
title: "RAG"
path: "backend/app/rag/"
language: python
status: active
created: 2026-05-10
updated: 2026-06-19
depends_on: [llm-gateway]
used_by: [runtime-orchestrator, user_chat]
tags: [module, rag]
---

# RAG (`app/rag/`)

App-owned `RagBackend` protocol + two interchangeable adapters (LightRAG and Vertex AI
RAG Engine). Agents and routers call this module, never a backend service directly.
Selected by `rag_provider` config; default is `"lightrag"`.

## Responsibilities

- Index transcripts, summaries, decisions, action items, and multimodal meeting artifacts
  such as screen captures or linked documents.
- Index backlog documents fetched from Jira and Notion at project creation.
- Retrieve with normalized **citations** (source provenance).
- Enforce project-scoped filters for user-facing chat retrieval.
- Translate backend responses into stable app-owned result shapes.
- Keep backend storage/deployment details behind configuration.

## Package structure

| File | Contents |
|---|---|
| `__init__.py` | Re-exports: `RagBackend`, `RagDocument`, `RagMedia`, `IndexResult`, `RagStatus`, `Citation`, `RetrievedPassage`, `RagError`, `build_rag_client` |
| `base.py` | `RagBackend` protocol, shared dataclasses, `RagError`, provenance helpers |
| `lightrag.py` | `LightRagBackend` — HTTP adapter for LightRAG service (text-only) |
| `vertex.py` | `VertexRagBackend` — Vertex AI RAG Engine adapter (multimodal) |
| `factory.py` | `build_rag_client(settings) -> RagBackend` — dispatch on `rag_provider` |

## Document model

```python
@dataclass(frozen=True)
class RagMedia:
    mime_type: str
    data: bytes | None = None    # inline bytes (uploaded via temp file)
    uri: str | None = None       # OR a gs://, drive, or http(s) URI
    filename: str | None = None  # optional original name (extension hint)

@dataclass
class RagDocument:
    source_kind: str
    source_id: str
    title: str
    source_uri: str
    text: str | None = None           # optional (was required pre-65g)
    media: list[RagMedia] = field(default_factory=list)  # NEW in 65g
```

Existing callers (Jira/Notion ingestion) pass `media=[]` — backward compatible.

## The protocol

```python
@runtime_checkable
class RagBackend(Protocol):
    async def index_documents(self, project_id: str,
                              documents: Sequence[RagDocument]) -> IndexResult: ...
    async def clear_project(self, project_id: str) -> int: ...
    async def clear_source(self, project_id: str,
                           source_kind: str, source_id: str) -> int: ...
    async def status(self, project_id: str) -> RagStatus: ...
    async def retrieve(self, project_id: str, question: str, *,
                       k: int = 6) -> list[RetrievedPassage]: ...
    async def pipeline_busy(self) -> bool: ...
    async def failed_count(self) -> int: ...
    async def reprocess_failed(self) -> None: ...
```

All 8 methods are implemented by both adapters. `runtime_checkable` conformance tests
assert this for each backend. `build_rag_client(settings)` is the single construction
point; dispatch is on `settings.rag_provider`.

## Backends

### `LightRagBackend` (default, `rag_provider="lightrag"`)

Talks to the LightRAG service over HTTP. **Text-only**: a document with a non-empty
`media` list raises `RagError("multimodal ingestion not supported by the LightRAG
backend")` — no silent drop. Project isolation is via `file_source` prefix
`"{project_id}::{source_kind}::{source_id}"` (a reference-level tag; the knowledge
graph is shared across projects — known limitation `ScrumAgent-o39`). Single-flight
pipeline coordination via polling `GET /documents/pipeline_status` for idle before
deletes/inserts (`ScrumAgent-srp`). `pipeline_busy`, `failed_count`, and
`reprocess_failed` are real calls to LightRAG endpoints.

### `VertexRagBackend` (`rag_provider="google"`)

Uses the `vertexai.rag` SDK (lazy-imported; injectable for tests). Blocking SDK calls
are wrapped in `asyncio.to_thread`; `upload_file` concurrency is bounded by
`asyncio.Semaphore(vertex_max_concurrency)`. **Multimodal**: text is uploaded as a temp
`.txt`; media parts are uploaded as temp files with extensions derived from `mime_type`;
URI-only media uses `rag.import_files`. **Project isolation is native**: one corpus per
project (`display_name = "{corpus_prefix}-{project_id}"`); `ScrumAgent-o39` is a
non-issue on this path, there is no shared graph. Provenance via RagFile `display_name`:
`"{source_kind}::{source_id}"` for text, `"{source_kind}::{source_id}::media{n}"` for
each media part. Retrieve does not need a cross-project post-filter (corpus is the
boundary). `pipeline_busy -> False`, `failed_count -> 0`, `reprocess_failed -> None`
(Approach A honest no-ops — correct for a managed backend; the auto-heal scheduler
short-circuits harmlessly). Optional SDK install: `requirements-google.txt`
(`google-cloud-aiplatform[rag]>=1.71`).

## Configuration boundary

Backend settings stay app-level:

- `RAG_PROVIDER=lightrag` (default) or `RAG_PROVIDER=google`
- `LIGHTRAG_BASE_URL=http://lightrag:9621`
- `LIGHTRAG_WORKSPACE=scrumagent`
- `LIGHTRAG_TIMEOUT_SECONDS=10`
- optional `LIGHTRAG_API_KEY`
- `RAG_PIPELINE_POLL_SECONDS=1` / `RAG_PIPELINE_MAX_WAIT_SECONDS=120` /
  `RAG_PIPELINE_BUSY_RETRIES=5` — LightRAG single-flight pipeline coordination
- `VERTEX_LOCATION=us-central1` / `VERTEX_EMBEDDING_MODEL=text-multilingual-embedding-002` /
  `VERTEX_CORPUS_PREFIX=scrumagent` / `VERTEX_CHUNK_SIZE=512` / `VERTEX_CHUNK_OVERLAP=100` /
  `VERTEX_MAX_CONCURRENCY=4` — used only when `RAG_PROVIDER=google`
- Auth for Vertex reuses `GCP_PROJECT_ID` + `GOOGLE_APPLICATION_CREDENTIALS` (ADC)

LightRAG storage settings (`PGKVStorage`, `PGVectorStorage`, `PGGraphStorage`,
`PGDocStatusStorage`, and `POSTGRES_*`) are container-side deployment config, not
backend module config.

## API surface

### Write side — ScrumAgent-lcw / ScrumAgent-65g

- `index_documents(project_id, docs)` — batch indexing. LightRAG: `POST /documents/texts`
  (text only; `media` raises `RagError`). Vertex: `upload_file` per document part
  (text + media), concurrency-bounded; returns `IndexResult(submitted, failed, errors)`.
- `clear_project(project_id)` — delete all project documents before a re-sync.
  LightRAG: paged `POST /documents/paginated` prefix scan + batched
  `DELETE /documents/delete_document`. Vertex: `rag.list_files` + `rag.delete_file`
  per file (corpus is kept). Both return count deleted.
- `clear_source(project_id, source_kind, source_id)` — exact-match delete of a single
  source. Used by the "Remember" write-back path to dedup before re-inserting.
- `status(project_id)` — project-scoped document counts (`by_status`, `by_source_kind`);
  backs `GET /projects/{id}/knowledge-base/status`.

**Project scoping (LightRAG path):** `file_source` = `"{project_id}::{source_kind}::{source_id}"`.
This is a reference-level tag, not a graph-level boundary — known limitation `ScrumAgent-o39`.

**Single-flight pipeline coordination (`ScrumAgent-srp`, LightRAG only):** LightRAG's pipeline
is single-flight. `DELETE /documents/delete_document` returns `200 {status:"deletion_started"}`
while draining (`status:"busy"` = scheduled nothing). `POST /documents/texts` returns `HTTP 409`
while busy. The adapter polls `pipeline_status.busy=false` before each delete/insert and retries
`status:"busy"` deletes and `409` inserts. Bounded by `RAG_PIPELINE_MAX_WAIT_SECONDS` /
`RAG_PIPELINE_BUSY_RETRIES`; exceeding raises `RagError`.

- `pipeline_busy()` — LightRAG: one-shot probe of `pipeline_status.busy`; defers a destructive
  resync if busy (`ScrumAgent-vw3`). Vertex: always `False`.
- `failed_count()` / `reprocess_failed()` — LightRAG: instance-wide FAILED doc count
  (`GET /documents/status_counts`) and re-embed-in-place (`POST /documents/reprocess_failed`),
  used by the auto-heal scheduler (`ScrumAgent-clo`). Vertex: both return `0`/`None`
  (managed backend; no exposed FAILED state).

### Read side — ScrumAgent-r0k / 2jb

- `retrieve(project_id, question, k)` → `list[{text, score, citation{source_kind, source_id,
  title, source_uri}}]`

  LightRAG: `POST /query` with `only_need_context=true`, `include_references=true`,
  `include_chunk_content=true`; post-filters to references whose `file_path` starts with
  `"{project_id}::"` (anti-leakage; `ScrumAgent-uzx`). No per-reference score from LightRAG;
  `score=0.0` placeholder, list order is the ranking signal.

  Vertex: `rag.retrieval_query` against the project's corpus (corpus = project boundary; no
  post-filter needed). `ctx.score` is real. Uncited contexts (no parseable `source_display_name`)
  are dropped.

### Planned

- `index_meeting(...)` — feed normalized meeting artifacts (transcripts, summaries, decisions,
  action items) into the store. Tracked: `ScrumAgent-o39`.

## Used by

- `ingestion` — indexes Jira/Notion backlog documents on project creation and resync
  (see [[flows/backlog-ingestion]]).
- `meeting_participation` — will index after analysis (planned).
- `user_chat` — calls `retrieve(project_id, question, k)` before every answer; calls
  `clear_source` + `index_documents` on the "Remember" write-back (see [[flows/chat]]).
- `/settings -> Knowledge base` — real source counts + index health via `status()`, plus
  auto-sync toggle and "Sync now" (`ScrumAgent-bah`).

## See also

- [[concepts/lightrag-multimodal]] — LightRAG service context
- [[decisions/2026-06-19-rag-provider-protocol]] — protocol design decision (ScrumAgent-65g)
