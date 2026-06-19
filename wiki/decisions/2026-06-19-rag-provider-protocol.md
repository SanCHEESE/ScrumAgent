---
type: decision
title: "Unified RagBackend protocol + two adapters (LightRAG & Vertex)"
status: accepted
date: 2026-06-19
created: 2026-06-19
updated: 2026-06-19
tags: [decision, rag, multimodal, vertex]
---

# Unified RagBackend protocol + two adapters

**Issue:** ScrumAgent-65g  
**Related:** ScrumAgent-o39 (project isolation), ScrumAgent-clo (auto-heal), ScrumAgent-vw3/srp (LightRAG single-flight)

## Context

`backend/app/rag.py` hard-coded a single RAG implementation (`RagClient`) talking to the
LightRAG service. Two needs converged:

1. **A second backend:** Vertex AI RAG Engine for native project isolation and multimodal
   ingestion, selectable by config.
2. **Multimodal document model:** meeting artifacts (screenshots, PDFs) require a document
   type that carries both text and binary/URI media parts.

## Decision

Introduce a typed `RagBackend` protocol with 8 async methods and two interchangeable
adapters behind a `build_rag_client(settings)` factory. `rag_provider=lightrag` (default)
is unchanged in behavior; `rag_provider=google` activates the Vertex adapter.

### Protocol shape — Approach A: fat protocol + honest no-ops

One `RagBackend` protocol exposes the full 8-method surface. The three methods that are
LightRAG-specific in semantics (`pipeline_busy`, `failed_count`, `reprocess_failed`) are
implemented as honest no-ops on the Vertex adapter: `pipeline_busy -> False`,
`failed_count -> 0`, `reprocess_failed -> None`. These are semantically correct for a
managed backend (no shared single-flight pipeline; embedding retries are internal to the
service). Callers do not change.

**Alternative considered: Approach B (split protocol, two sub-protocols).** Rejected because
it would require callers to type-narrow at every site and adds abstraction with no benefit —
the no-ops are cheap and explicit.

### Multimodal document model

```python
@dataclass(frozen=True)
class RagMedia:
    mime_type: str
    data: bytes | None = None    # inline bytes
    uri: str | None = None       # OR a gs://, drive, or http(s) URI
    filename: str | None = None

@dataclass
class RagDocument:
    source_kind: str
    source_id: str
    title: str
    source_uri: str
    text: str | None = None           # was required; now optional
    media: list[RagMedia] = field(default_factory=list)
```

Backward compatible: existing callers pass `media=[]`. LightRAG raises `RagError` on
non-empty `media` (explicit failure, no silent drop).

### LightRAG adapter

`RagClient` renamed to `LightRagBackend`, moved to `app/rag/lightrag.py`. Behavior
unchanged except: `index_documents` raises `RagError` if any document carries `media`.
Stays text-only by design; multimodal LightRAG (RAG-Anything / file endpoints) is out of
scope.

### Vertex AI RAG Engine adapter

`VertexRagBackend` in `app/rag/vertex.py`. Key characteristics:

- **Project isolation is native — one corpus per project.** Corpus `display_name` =
  `"{corpus_prefix}-{project_id}"`. The corpus is the isolation boundary — no shared
  knowledge graph. `ScrumAgent-o39` is a non-issue on this path.
- **Provenance via `display_name`.** Text: `"{source_kind}::{source_id}"`; media part `n`:
  `"{source_kind}::{source_id}::media{n}"`. Parses back to `Citation(source_kind, source_id)`
  on retrieval (first two `"::"` segments). Mirrors the LightRAG citation shape.
- **Multimodal ingestion via `upload_file` per file.** Text body written to a temp `.txt`;
  each `RagMedia` with `data` written to a temp file (extension from `mime_type`); URI-only
  media uses `rag.import_files`. Concurrency bounded by `asyncio.Semaphore(max_concurrency)`.
  Blocking SDK calls wrapped in `asyncio.to_thread`.
- **`upload_file` vs GCS-staging trade-off.** `upload_file` is one HTTP call per document
  part — simple and correct for the current backlog sizes. GCS-staging (`import_files` with
  a GCS URI list) reduces per-file overhead for large batch imports and is the documented
  future optimization, but it requires GCS bucket management and adds complexity with no
  current need. Out of scope for ScrumAgent-65g.
- **Dormant by default.** `rag_provider=lightrag` is the default; the Vertex path is code-
  ready but not active in production. Activating requires `RAG_PROVIDER=google`,
  `GCP_PROJECT_ID`, and `google-cloud-aiplatform[rag]>=1.71` from `requirements-google.txt`.
  The SDK is lazy-imported inside `vertex.py` so the default image stays light.

### Factory and wiring

```python
def build_rag_client(settings: Settings) -> RagBackend:
    if settings.rag_provider == "google":
        from app.rag.vertex import VertexRagBackend
        return VertexRagBackend.from_settings(settings)
    from app.rag.lightrag import LightRagBackend
    return LightRagBackend.from_settings(settings)
```

Five construction sites updated (`deps.get_rag_client`, `deps.get_orchestrator`,
`main.lifespan`, `ingestion.run_ingestion`, and `routers/projects.py` — the
knowledge-base `status` endpoint). Existing imports via `app.rag` package
`__init__.py` re-exports are preserved.

## Consequences

- **+** Single protocol surface; callers are backend-agnostic.
- **+** True project isolation on the Vertex path (resolves `ScrumAgent-o39` for Vertex users).
- **+** Multimodal ingestion path exists without blocking LightRAG text-only operation.
- **+** Auto-heal scheduler harmlessly short-circuits on Vertex (no-op `failed_count`/`reprocess_failed`).
- **−** `ScrumAgent-o39` remains open for the LightRAG path (shared graph, reference-level tag only).
- **−** Vertex path has no live GCP validation yet (unit-tested against a fake SDK).
- **−** `upload_file` per file is not optimal for large batches; GCS-staging is the future optimization.

## See also

[[modules/rag]], [[concepts/lightrag-multimodal]]
