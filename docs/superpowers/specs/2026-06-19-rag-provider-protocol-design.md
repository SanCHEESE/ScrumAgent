# Unified RAG backend protocol + Vertex AI RAG Engine adapter (multimodal)

- **Issue:** ScrumAgent-65g
- **Date:** 2026-06-19
- **Status:** approved (design)
- **Related:** ScrumAgent-o39 (true project isolation — solved on the Vertex path),
  ScrumAgent-clo (auto-heal — becomes a no-op on Vertex), ScrumAgent-vw3/srp
  (LightRAG single-flight pipeline — LightRAG-only)

## Problem

`backend/app/rag.py` hard-codes a single RAG implementation (`RagClient`, talking to
LightRAG over HTTP). We want a **single protocol** with **two interchangeable adapters**:
the existing **LightRAG** and a new **Google Vertex AI RAG Engine** adapter, selected by
configuration. The document model must be **multimodal** (text + media), with the Vertex
adapter implementing multimodal fully.

## Decisions (locked during brainstorming)

1. **Google service = Vertex AI RAG Engine** (`vertexai.rag` SDK): managed corpora +
   files + `retrieval_query`. Closest 1:1 analog to LightRAG.
2. **Scope = full working adapter, no live GCP run.** Real `vertexai.rag` calls, unit-
   tested against an injected fake SDK. Provider selection via config; wired into
   `deps`/`main`/`ingestion`. `rag_provider=lightrag` stays the default — the code is
   ready but not switched on.
3. **Multimodal:** the protocol and document model are multimodal. **Vertex implements it
   fully** (text + images + PDF via `upload_file` with a multimodal-capable embedding
   model). **LightRAG stays text-only**; a document carrying `media` on the LightRAG path
   raises an explicit `RagError` (no silent drop, no fake).
4. **Protocol shape = Approach A (fat protocol + honest no-ops).** One `RagBackend`
   protocol with the full 8-method surface. Vertex implements the 5 portable methods and
   makes the 3 LightRAG-shaped methods (`pipeline_busy`, `failed_count`,
   `reprocess_failed`) honest no-ops — semantically correct for a managed backend (no
   shared single-flight pipeline; embedding retries are internal to the service).
   Consumers do not change.
5. **Vertex ingestion = `upload_file` per file**, bounded concurrency. GCS-staging +
   `import_files` (bulk) is documented as a future optimization, out of scope here.

## Architecture

### Module structure

`backend/app/rag.py` (single module) becomes a package `backend/app/rag/`:

| File | Contents |
|---|---|
| `__init__.py` | Re-exports: `RagBackend`, `RagDocument`, `RagMedia`, `IndexResult`, `RagStatus`, `Citation`, `RetrievedPassage`, `RagError`, `build_rag_client` |
| `base.py` | `RagBackend` protocol, shared dataclasses, `RagError`, provenance helpers (`_parse_citation`) |
| `lightrag.py` | `LightRagBackend` — the current `RagClient`, moved ~verbatim (text-only) |
| `vertex.py` | `VertexRagBackend` — new, multimodal, via `vertexai.rag` |
| `factory.py` | `build_rag_client(settings) -> RagBackend` (dispatch on `rag_provider`) |

Existing imports `from app.rag import RagDocument, RetrievedPassage, RagError` keep
working through `__init__.py` re-exports. `RagClient` is **renamed** to `LightRagBackend`
(no compat alias — all call sites are updated). The four construction sites
(`deps.get_rag_client`, `deps.get_orchestrator`, `main.lifespan`,
`ingestion.run_ingestion`) switch from `RagClient.from_settings(settings)` to
`build_rag_client(settings)`.

### Shared types (multimodal document model)

```python
@dataclass(frozen=True)
class RagMedia:
    """One non-text artifact attached to a document (image, PDF, Office doc)."""
    mime_type: str                 # "image/png", "application/pdf", ...
    data: bytes | None = None      # inline bytes (written to a temp file to upload)
    uri: str | None = None         # OR a gs://, drive, or http(s) URI (no bytes needed)
    filename: str | None = None    # optional original name (extension hint)

@dataclass
class RagDocument:
    source_kind: str
    source_id: str
    title: str
    source_uri: str
    text: str | None = None        # was: text: str (required) -> now optional
    media: list[RagMedia] = field(default_factory=list)   # NEW
```

`text` becomes optional and `media` is added. `ingestion._to_rag` builds text-only
documents (`media=[]`) and stays valid — backward compatible. `IndexResult`, `RagStatus`,
`Citation`, `RetrievedPassage`, `RagError` are unchanged and move to `base.py`.

### The protocol

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

`typing.Protocol` (structural) is the lightest idiomatic fit for this codebase (no
inheritance imposed on adapters). Because the backend is not type-checked in CI, a
`runtime_checkable` conformance test asserts each adapter satisfies the surface.

## Component: LightRagBackend

The current `RagClient`, moved to `lightrag.py` and renamed. One behavior addition:
`index_documents` now receives documents that may carry `media`. It indexes `text` as
today via `POST /documents/texts`; **if any document has non-empty `media`, it raises**
`RagError("multimodal ingestion not supported by the LightRAG backend")`. The current
caller (Jira/Notion ingestion) never passes media, so this never trips in production.
`from_settings` stays for self-construction. All other methods are unchanged.

## Component: VertexRagBackend

Constructed with an injectable SDK facade for testability:

```python
class VertexRagBackend:
    def __init__(self, *, project, location, embedding_model, corpus_prefix,
                 chunk_size, chunk_overlap, max_concurrency,
                 credentials_path=None, rag_sdk=None, init_fn=None): ...
    @classmethod
    def from_settings(cls, settings) -> "VertexRagBackend": ...
```

In production, `rag_sdk` lazy-imports `from vertexai import rag` and `init_fn` is
`vertexai.init`; tests inject fakes. The blocking SDK is wrapped in `asyncio.to_thread`;
`upload_file` concurrency is bounded by an `asyncio.Semaphore(max_concurrency)`.

### Project isolation = one corpus per project

`_ensure_corpus(project_id) -> corpus_name`:
- look up a corpus whose `display_name == f"{corpus_prefix}-{project_id}"` via
  `rag.list_corpora()`;
- create it if missing: `rag.create_corpus(display_name=..., backend_config=
  rag.RagVectorDbConfig(rag_embedding_model_config=...))` with the configured embedding
  model (`vertex_embedding_model`, a Vertex text-embedding model);
- cache `project_id -> corpus_name` in an in-process dict (`list_corpora` is the source of
  truth on a cache miss).

The corpus **is** the project boundary — true isolation, no shared graph. `o39` is a
non-issue on the Vertex path. No new DB columns: the mapping is derived from the
deterministic `display_name`.

### Provenance

On upload, `display_name = f"{source_kind}::{source_id}"` and
`description = f"{title}\n{source_uri}"`. A media part `n` of a document becomes its own
`RagFile` with `display_name = f"{source_kind}::{source_id}::media{n}"`. On retrieval, the
context's `source_display_name` parses back to `Citation(source_kind, source_id)` (split on
`"::"`, take the first two segments). This matches the LightRAG path, which also returns a
`Citation` with `title`/`source_uri` left `None`.

### Method behaviors

- **`index_documents`**: `_ensure_corpus`; for each document write `text` to a temp `.txt`
  (content `f"{title}\n{source_uri}\n\n{text}"`, mirroring the LightRAG text packing) and
  upload via `rag.upload_file(corpus, path, display_name, description)`; write each `media`
  to a temp file with an extension derived from `mime_type` (or pass `uri` directly when
  set) and upload it. Returns `IndexResult(submitted, failed, errors)`. **Multimodal
  handling** is RAG Engine's own: it parses uploaded files (images, PDF) at ingestion —
  the adapter just uploads the file with its mime type. The exact parsing/transformation
  config (e.g. `TransformationConfig`, layout parser, or a multimodal embedding option) is
  confirmed against the `vertexai.rag` SDK during implementation; it does not change the
  adapter's protocol surface.
- **`retrieve`**: `_ensure_corpus`; `rag.retrieval_query(rag_resources=[
  rag.RagResource(rag_corpus=corpus)], text=question,
  rag_retrieval_config=rag.RagRetrievalConfig(top_k=k))`. Map each context to
  `RetrievedPassage(text=ctx.text, score=ctx.score, citation=parse(ctx.source_display_name))`.
  **No cross-project post-filter** is needed (the corpus is the boundary). Contexts whose
  `source_display_name` does not parse to a citation are dropped (mirrors LightRAG dropping
  uncited references).
- **`clear_project`**: `_ensure_corpus`; `rag.list_files(corpus)` -> `rag.delete_file(name)`
  for each (the corpus itself is kept). Returns the count deleted.
- **`clear_source`**: like `clear_project` but filtered to files whose `display_name`
  starts with `f"{source_kind}::{source_id}"`.
- **`status`**: `_ensure_corpus`; `rag.list_files(corpus)` -> `total` = count,
  `by_source_kind` parsed from `display_name` prefixes, `by_status` from each file's
  `file_status` state (best-effort; default `"active"` if the SDK shape differs).
- **`pipeline_busy` -> `False`**, **`failed_count` -> `0`**, **`reprocess_failed` -> `None`**
  (Approach A no-ops). The scheduler's auto-heal therefore short-circuits on the Vertex
  path (`decide_heal(0)` returns immediately).

## Config + factory + wiring

```python
# config.py
rag_provider: Literal["lightrag", "google"] = "lightrag"   # default unchanged
# Vertex (used only when rag_provider="google"):
vertex_location: str = "us-central1"
vertex_embedding_model: str = "text-multilingual-embedding-002"  # text embedding (RU content)
vertex_corpus_prefix: str = "scrumagent"
vertex_chunk_size: int = 512
vertex_chunk_overlap: int = 100
vertex_max_concurrency: int = 4
# auth reuses gcp_project_id + google_application_credentials (ADC)
```

```python
# factory.py
def build_rag_client(settings: Settings) -> RagBackend:
    if settings.rag_provider == "google":
        from app.rag.vertex import VertexRagBackend
        return VertexRagBackend.from_settings(settings)
    from app.rag.lightrag import LightRagBackend
    return LightRagBackend.from_settings(settings)
```

`google-cloud-aiplatform[rag]` is added as an **optional extra** in the backend
`pyproject.toml` and lazy-imported inside `vertex.py`, so the default install stays light
and the test suite runs against a fake (no SDK needed). The orchestrator's `_GatedRag`
already proxies `retrieve`/`index_documents` generically and does not change.

## Error handling

All SDK errors (`google.api_core.exceptions.*`) and transport failures are wrapped in
`RagError` — the single error type across both backends (callers already catch it). Media
on the LightRAG path raises `RagError`. A missing `gcp_project_id` when
`rag_provider="google"` fails fast at construction.

## Testing (TDD)

- `test_rag_adapter.py` — kept (LightRAG against a fake httpx transport); update the import
  and add a "media -> RagError" case.
- `test_rag_vertex.py` (new) — fake `rag` SDK facade: `_ensure_corpus` find-or-create +
  cache; text indexing (correct `display_name`/`description`); **multimodal** indexing
  (media files uploaded with `media{n}` display names); `clear_project`/`clear_source`
  delete the right files; `retrieve` maps contexts to passages **without** a cross-project
  filter; the three no-ops.
- `test_rag_factory.py` (new) — `build_rag_client` returns the right backend per
  `rag_provider`; missing `gcp_project_id` under `google` fails fast.
- Conformance test — both backends satisfy `RagBackend` (`runtime_checkable` + surface
  check).
- `test_config.py` — new literal + Vertex settings defaults.

Backend tests run with `cd backend && uv run pytest -q` (currently 269 green).

## Documentation

- `wiki/modules/rag.md` — document the protocol + two backends; bump `updated:`.
- `wiki/decisions/2026-06-19-rag-provider-protocol.md` (new) — the decision and its
  rationale (unified protocol, two adapters, multimodal model, Vertex corpus-per-project
  isolation, Approach A no-ops, `upload_file`-per-file vs GCS-staging).
- `wiki/concepts/lightrag-multimodal.md` — note that Vertex is the multimodal path for
  now; LightRAG stays text-only.
- End of session — `wiki/log.md` entry + refreshed `wiki/hot.md`.

## Out of scope

- Live run against GCP (no credentials / no `aiplatform` API enablement here).
- The multimodal content producer (`index_meeting` / meeting capture).
- Multimodal LightRAG (RAG-Anything / file endpoints).
- GCS-staging + `import_files` bulk ingestion (future optimization for large backlogs).
- Project-model migration for provider-specific columns (Vertex isolation is via
  `display_name`, no new columns).
