# Unified RAG Backend Protocol + Vertex Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a single `RagBackend` protocol from the current `RagClient` and add a second, multimodal-capable Vertex AI RAG Engine adapter, selectable by config.

**Architecture:** `backend/app/rag.py` becomes a package `backend/app/rag/` with shared types + a `RagBackend` `typing.Protocol` (`base.py`), the existing LightRAG client renamed to `LightRagBackend` (`lightrag.py`, text-only), a new `VertexRagBackend` (`vertex.py`, multimodal via `vertexai.rag`), and a `build_rag_client(settings)` factory (`factory.py`). Approach A: the protocol carries the full 8-method surface; the Vertex adapter makes the three LightRAG-shaped methods honest no-ops.

**Tech Stack:** Python 3 / FastAPI, dataclasses, `httpx` (LightRAG), `google-cloud-aiplatform[rag]` / `vertexai` SDK (Vertex, lazy-imported + injectable), `pytest` (`asyncio.run`-driven async tests, no pytest-asyncio).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-19-rag-provider-protocol-design.md`. Issue: **ScrumAgent-65g**.
- Backend tests run with `cd backend && uv run pytest -q` (currently **269 green** — keep them green at every commit).
- `rag_provider` default stays `"lightrag"` — the Vertex path is dormant by default.
- Approach A: `VertexRagBackend.pipeline_busy()` → `False`, `failed_count()` → `0`, `reprocess_failed()` → `None` (no-ops, semantically correct for a managed backend).
- LightRAG is text-only: a `RagDocument` carrying non-empty `media` on the LightRAG path raises `RagError` (no silent drop).
- The blocking `vertexai.rag` SDK is wrapped in `asyncio.to_thread`; `upload_file` concurrency is bounded by an `asyncio.Semaphore`.
- Vertex provenance lives in `RagFile.display_name = "{source_kind}::{source_id}"` (media part `n`: `"{source_kind}::{source_id}::media{n}"`). One corpus per project: `display_name == f"{corpus_prefix}-{project_id}"`.
- `RagError` is the single error type surfaced by both backends (callers already catch it).
- No live GCP run; the Vertex adapter is unit-tested against an injected fake SDK.
- Commit messages end with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and use `rtk git` per project convention.

---

### Task 1: Split `app/rag.py` into a package; rename `RagClient` → `LightRagBackend`

Pure refactor — no behavior change. Moves the shared dataclasses + helpers into `base.py`, the client into `lightrag.py`, and re-exports everything from `__init__.py` so existing `from app.rag import ...` imports keep working.

**Files:**
- Create: `backend/app/rag/__init__.py`
- Create: `backend/app/rag/base.py`
- Create: `backend/app/rag/lightrag.py`
- Delete: `backend/app/rag.py`
- Modify: `backend/tests/test_rag_adapter.py` (import + `_client`/`_race_client` rename)
- Modify: `backend/tests/test_deps.py:41,45` (import + assert rename)

**Interfaces:**
- Produces: `LightRagBackend` (was `RagClient`; identical constructor + `from_settings`), and re-exported names `RagError`, `RagDocument`, `IndexResult`, `RagStatus`, `Citation`, `RetrievedPassage` from `app.rag`.

- [ ] **Step 1: Create `backend/app/rag/base.py`** with the shared types + helpers moved verbatim from `app/rag.py` (lines 26–78): the module-level constants `_PAGE_SIZE`, `_DELETE_BATCH`, `_DELETE_ACCEPTED`, `_DELETE_BUSY`, the `RagError` class, the dataclasses `RagDocument`, `IndexResult`, `RagStatus`, `Citation`, `RetrievedPassage`, and the helpers `_parse_citation`, `_file_source`. Header:

```python
"""Shared RAG types and the backend protocol.

App code depends only on these app-owned shapes; each adapter (LightRAG, Vertex)
translates its backend's wire format into them. `RagError` is the single error
type both adapters raise."""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

_PAGE_SIZE = 200
_DELETE_BATCH = 100
_DELETE_ACCEPTED = {None, "deletion_started"}
_DELETE_BUSY = "busy"


class RagError(RuntimeError):
    """RAG adapter failure (transport error or non-2xx/SDK error)."""


@dataclass
class RagDocument:
    text: str
    source_kind: str
    source_id: str
    title: str
    source_uri: str


# ... IndexResult, RagStatus, Citation, RetrievedPassage, _parse_citation,
# ... _file_source moved verbatim from the old app/rag.py
```

(Leave `RagDocument` text-only and the protocol absent for now — Task 2 adds multimodal + protocol.)

- [ ] **Step 2: Create `backend/app/rag/lightrag.py`** by moving the `RagClient` class (old `app/rag.py` lines 81–374) verbatim, renamed to `LightRagBackend`. Replace its module docstring/imports header with:

```python
"""App-owned LightRAG adapter (text-only). Agents/routers call this via the
RagBackend protocol, never LightRAG directly.

LightRAG v1.5.3 REST: insert via POST /documents/texts; provenance is the
`file_source` field "{project_id}::{kind}::{id}" (no metadata dict, no upsert)."""
from __future__ import annotations

import asyncio
import math
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence

import httpx

from app.config import Settings
from app.rag.base import (
    _DELETE_ACCEPTED,
    _DELETE_BATCH,
    _DELETE_BUSY,
    _PAGE_SIZE,
    Citation,
    IndexResult,
    RagDocument,
    RagError,
    RagStatus,
    RetrievedPassage,
    _file_source,
    _parse_citation,
)


class LightRagBackend:
    # body identical to the old RagClient (the from_settings return annotation
    # becomes "LightRagBackend")
    ...
```

- [ ] **Step 3: Create `backend/app/rag/__init__.py`** re-exporting the public surface:

```python
"""RAG package: app-owned types + adapters behind the RagBackend protocol."""
from app.rag.base import (
    Citation,
    IndexResult,
    RagDocument,
    RagError,
    RagStatus,
    RetrievedPassage,
)
from app.rag.lightrag import LightRagBackend

__all__ = [
    "Citation",
    "IndexResult",
    "LightRagBackend",
    "RagDocument",
    "RagError",
    "RagStatus",
    "RetrievedPassage",
]
```

- [ ] **Step 4: Delete the old module**

Run: `rm backend/app/rag.py`

- [ ] **Step 5: Update the two test files that name `RagClient`**

In `backend/tests/test_rag_adapter.py`: change the import on line 7 to `LightRagBackend` and replace every `RagClient` with `LightRagBackend` (the import, the `_client` return annotation + body, the `_race_client` return annotation + body).

In `backend/tests/test_deps.py`: line 41 `from app.rag import LightRagBackend` and line 45 `assert isinstance(deps.get_rag_client(s), LightRagBackend)`.

- [ ] **Step 6: Run the full suite to verify the refactor is green**

Run: `cd backend && uv run pytest -q`
Expected: PASS — same count as before (269), no import errors.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/app/rag/ backend/tests/test_rag_adapter.py backend/tests/test_deps.py && \
rtk git rm backend/app/rag.py 2>/dev/null; \
rtk git commit -m "refactor(rag): split rag.py into a package, rename RagClient->LightRagBackend (ScrumAgent-65g)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add the `RagBackend` protocol + multimodal document model + LightRAG media guard

**Files:**
- Modify: `backend/app/rag/base.py` (add `RagMedia`, extend `RagDocument`, add `RagBackend` protocol)
- Modify: `backend/app/rag/__init__.py` (export `RagMedia`, `RagBackend`)
- Modify: `backend/app/rag/lightrag.py` (media guard in `index_documents`)
- Create: `backend/tests/test_rag_types.py`
- Modify: `backend/tests/test_rag_adapter.py` (media-guard test)

**Interfaces:**
- Consumes: `LightRagBackend` (Task 1).
- Produces: `RagMedia(mime_type, data=None, uri=None, filename=None)`; `RagDocument(source_kind, source_id, title, source_uri, text=None, media=[])`; `RagBackend` (`runtime_checkable` `Protocol`, 8 async methods).

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_rag_types.py`

```python
from __future__ import annotations

import httpx

from app.rag import LightRagBackend, RagBackend, RagDocument, RagMedia


def test_ragdocument_text_optional_and_media_defaults_empty():
    doc = RagDocument(source_kind="jira", source_id="K-1", title="t", source_uri="u")
    assert doc.text is None
    assert doc.media == []


def test_ragdocument_carries_media():
    doc = RagDocument(
        source_kind="meeting", source_id="m-1", title="Standup", source_uri="u",
        text="notes", media=[RagMedia(mime_type="image/png", data=b"\x89PNG")],
    )
    assert doc.media[0].mime_type == "image/png"
    assert doc.media[0].data == b"\x89PNG"


def test_lightrag_backend_satisfies_protocol():
    backend = LightRagBackend("http://lightrag:9621")
    assert isinstance(backend, RagBackend)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest -q tests/test_rag_types.py`
Expected: FAIL — `ImportError: cannot import name 'RagMedia'` / `'RagBackend'`.

- [ ] **Step 3: Add `RagMedia`, extend `RagDocument`, add the protocol** in `backend/app/rag/base.py`

Replace the `RagDocument` definition and add `RagMedia` + `RagBackend`:

```python
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class RagMedia:
    """One non-text artifact attached to a document (image, PDF, Office doc)."""
    mime_type: str                 # "image/png", "application/pdf", ...
    data: bytes | None = None      # inline bytes (written to a temp file to upload)
    uri: str | None = None         # OR a gs://, drive, or http(s) URI
    filename: str | None = None    # optional original name (extension hint)


@dataclass
class RagDocument:
    source_kind: str
    source_id: str
    title: str
    source_uri: str
    text: str | None = None
    media: list[RagMedia] = field(default_factory=list)


@runtime_checkable
class RagBackend(Protocol):
    """The contract every RAG adapter implements. Project scoping is a parameter
    on every method; isolation is each adapter's concern (LightRAG: file_source
    prefix; Vertex: one corpus per project)."""

    async def index_documents(
        self, project_id: str, documents: Sequence[RagDocument]
    ) -> "IndexResult": ...
    async def clear_project(self, project_id: str) -> int: ...
    async def clear_source(
        self, project_id: str, source_kind: str, source_id: str
    ) -> int: ...
    async def status(self, project_id: str) -> "RagStatus": ...
    async def retrieve(
        self, project_id: str, question: str, *, k: int = 6
    ) -> list["RetrievedPassage"]: ...
    async def pipeline_busy(self) -> bool: ...
    async def failed_count(self) -> int: ...
    async def reprocess_failed(self) -> None: ...
```

(Place `RagMedia`/`RagDocument` near the other dataclasses and `RagBackend` after `RetrievedPassage` is defined so the forward refs resolve.)

- [ ] **Step 4: Export the new names** in `backend/app/rag/__init__.py` — add `RagMedia` and `RagBackend` to both the `from app.rag.base import (...)` block and `__all__`.

- [ ] **Step 5: Run to verify the type/protocol tests pass**

Run: `cd backend && uv run pytest -q tests/test_rag_types.py`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing LightRAG media-guard test** — append to `backend/tests/test_rag_adapter.py`

```python
def test_index_documents_rejects_media_on_lightrag():
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("must not call LightRAG when media is present")

    from app.rag import RagMedia
    docs = [
        RagDocument(
            source_kind="meeting", source_id="m-1", title="t", source_uri="u",
            text="notes", media=[RagMedia(mime_type="image/png", data=b"x")],
        )
    ]
    try:
        asyncio.run(_client(handler).index_documents("proj-1", docs))
        raise AssertionError("expected RagError for media on LightRAG")
    except RagError:
        pass
```

- [ ] **Step 7: Run to verify it fails**

Run: `cd backend && uv run pytest -q tests/test_rag_adapter.py::test_index_documents_rejects_media_on_lightrag`
Expected: FAIL (no guard yet — it calls the handler and asserts).

- [ ] **Step 8: Add the media guard** at the top of `LightRagBackend.index_documents` in `backend/app/rag/lightrag.py`, right after `docs = list(documents)`:

```python
        if any(d.media for d in docs):
            raise RagError(
                "multimodal ingestion not supported by the LightRAG backend"
            )
```

Also update the indexed-text builder to tolerate the now-optional `text` (treat `None` as empty):

```python
        texts = [f"{d.title}\n{d.source_uri}\n\n{d.text or ''}" for d in docs]
```

- [ ] **Step 9: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS (now 273 — +3 types, +1 guard).

- [ ] **Step 10: Commit**

```bash
rtk git add backend/app/rag/ backend/tests/test_rag_types.py backend/tests/test_rag_adapter.py && \
rtk git commit -m "feat(rag): RagBackend protocol + multimodal RagDocument; LightRAG media->RagError (ScrumAgent-65g)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Config (`rag_provider="google"` + Vertex settings) + `build_rag_client` factory + rewire construction sites

**Files:**
- Modify: `backend/app/config.py` (extend `rag_provider` literal, add Vertex settings)
- Create: `backend/app/rag/factory.py`
- Modify: `backend/app/rag/__init__.py` (export `build_rag_client`)
- Modify: `backend/app/deps.py:100-102,118-125` (use factory)
- Modify: `backend/app/ingestion.py:22,138` (use factory)
- Modify: `backend/app/main.py:31,36` (use factory)
- Modify: `backend/app/routers/projects.py:61,1251` (use factory)
- Create: `backend/tests/test_rag_factory.py`
- Modify: `backend/tests/test_config.py` (Vertex defaults)
- Modify: `backend/tests/test_deps.py:41,45` (factory-built type)

**Interfaces:**
- Consumes: `LightRagBackend` (Task 1), `RagBackend` (Task 2), `Settings`.
- Produces: `build_rag_client(settings: Settings) -> RagBackend` (re-exported from `app.rag`). New `Settings` fields: `rag_provider: Literal["lightrag", "google"]`, `vertex_location`, `vertex_embedding_model`, `vertex_corpus_prefix`, `vertex_chunk_size`, `vertex_chunk_overlap`, `vertex_max_concurrency`.

- [ ] **Step 1: Write the failing factory test** in `backend/tests/test_rag_factory.py`

```python
from __future__ import annotations

from app.config import Settings
from app.rag import LightRagBackend, build_rag_client


def _settings(**over) -> Settings:
    base = dict(_env_file=None, secret_key="x", openai_api_key="k",
                google_client_id="c", google_client_secret="s")
    base.update(over)
    return Settings(**base)


def test_factory_returns_lightrag_by_default():
    assert isinstance(build_rag_client(_settings()), LightRagBackend)


def test_factory_returns_lightrag_explicit():
    assert isinstance(build_rag_client(_settings(rag_provider="lightrag")), LightRagBackend)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest -q tests/test_rag_factory.py`
Expected: FAIL — `ImportError: cannot import name 'build_rag_client'`.

- [ ] **Step 3: Extend config** in `backend/app/config.py` — change the `rag_provider` line and add Vertex settings under the RAG section:

```python
    rag_provider: Literal["lightrag", "google"] = "lightrag"
```

```python
    # --- Vertex AI RAG Engine (used only when rag_provider="google"; ScrumAgent-65g) ---
    # Auth reuses gcp_project_id + google_application_credentials (ADC).
    vertex_location: str = "us-central1"
    vertex_embedding_model: str = "text-multilingual-embedding-002"  # text embedding (RU)
    vertex_corpus_prefix: str = "scrumagent"
    vertex_chunk_size: int = 512
    vertex_chunk_overlap: int = 100
    vertex_max_concurrency: int = 4
```

- [ ] **Step 4: Create the factory** `backend/app/rag/factory.py`

```python
"""Provider selection: build the RagBackend named by `settings.rag_provider`."""
from __future__ import annotations

from app.config import Settings
from app.rag.base import RagBackend


def build_rag_client(settings: Settings) -> RagBackend:
    if settings.rag_provider == "google":
        from app.rag.vertex import VertexRagBackend
        return VertexRagBackend.from_settings(settings)
    from app.rag.lightrag import LightRagBackend
    return LightRagBackend.from_settings(settings)
```

Export it: add `from app.rag.factory import build_rag_client` and `"build_rag_client"` to `__all__` in `backend/app/rag/__init__.py`.

The `google` branch lazy-imports `VertexRagBackend` (Task 4); the `gcp_project_id`-missing check lives in `VertexRagBackend.from_settings`. The factory's google branch is exercised by Task 4 (`test_rag_factory.py` gains a google test, and `test_rag_vertex.py` covers the missing-project-id failure) once the Vertex module exists — this task tests only the default/lightrag path.

- [ ] **Step 5: Rewire the five construction sites** from `RagClient.from_settings(settings)` to `build_rag_client(settings)`.

`backend/app/deps.py` — replace `get_rag_client` and the rag line in `get_orchestrator`:

```python
def get_rag_client(settings: Settings = Depends(get_settings)) -> "RagBackend":
    from app.rag import build_rag_client
    return build_rag_client(settings)
```

```python
    from app.llm import LlmGateway
    from app.rag import build_rag_client
    from app.runtime.orchestrator import Orchestrator

    return Orchestrator(
        llm=LlmGateway.from_settings(settings),
        rag=build_rag_client(settings),
        trace_factory=lambda: db,
    )
```

`backend/app/ingestion.py` — line 22 import becomes `from app.rag import RagDocument` (drop `RagClient`); add `from app.rag import build_rag_client` where used; line 138 `rag = build_rag_client(settings)`.

`backend/app/main.py` — lines 31/36: `from app.rag import build_rag_client` and `rag=build_rag_client(settings)`.

`backend/app/routers/projects.py` — line 61 import becomes `from app.rag import RagError` (drop `RagClient`); add `from app.rag import build_rag_client`; line 1251 `rag_status = await build_rag_client(settings).status(project.id)`.

- [ ] **Step 6: Update `backend/tests/test_deps.py`** — line 41 `from app.rag import LightRagBackend`, line 45 `assert isinstance(deps.get_rag_client(s), LightRagBackend)` (factory returns LightRAG by default).

- [ ] **Step 7: Add config defaults test** — append to `backend/tests/test_config.py::test_defaults_applied_when_required_present`:

```python
    assert settings.vertex_location == "us-central1"
    assert settings.vertex_corpus_prefix == "scrumagent"
    assert settings.vertex_max_concurrency == 4
```

- [ ] **Step 8: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS (the one google-branch test is `xfail`).

- [ ] **Step 9: Commit**

```bash
rtk git add backend/app/config.py backend/app/rag/ backend/app/deps.py backend/app/ingestion.py backend/app/main.py backend/app/routers/projects.py backend/tests/test_rag_factory.py backend/tests/test_config.py backend/tests/test_deps.py && \
rtk git commit -m "feat(rag): build_rag_client factory + rag_provider=google config; rewire construction sites (ScrumAgent-65g)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `VertexRagBackend` — construction, corpus lifecycle, write path (index), no-ops

**Files:**
- Create: `backend/app/rag/vertex.py`
- Create: `backend/tests/test_rag_vertex.py`

**Interfaces:**
- Consumes: `RagDocument`, `RagMedia`, `IndexResult`, `RagError`, `RagBackend` (base.py), `Settings`.
- Produces: `VertexRagBackend(*, project, location, embedding_model, corpus_prefix, chunk_size, chunk_overlap, max_concurrency, credentials_path=None, rag_sdk=None, init_fn=None)` + `VertexRagBackend.from_settings(settings)`. Implements `index_documents`, `pipeline_busy`, `failed_count`, `reprocess_failed` (read/management methods land in Task 4b).

The fake SDK below is the test double used by every Vertex test (Task 4 + 4b). It mirrors the `vertexai.rag` surface the adapter touches.

- [ ] **Step 1: Write the fake SDK + failing construction/index tests** in `backend/tests/test_rag_vertex.py`

```python
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.rag import IndexResult, RagDocument, RagError, RagMedia
from app.rag.vertex import VertexRagBackend


class FakeRag:
    """Mirror of the vertexai.rag surface the adapter uses. Records calls and
    returns SimpleNamespaces shaped like the real SDK return values."""

    def __init__(self):
        self.corpora: list[SimpleNamespace] = []
        self.files: list[SimpleNamespace] = []      # SimpleNamespace(name, display_name, corpus, file_status)
        self.uploads: list[dict] = []
        self.imports: list[dict] = []
        self.deleted: list[str] = []
        self._seq = 0
        self.query_contexts: list[SimpleNamespace] = []  # set per test for retrieval

    # --- config object constructors (opaque to the adapter) ---
    def RagEmbeddingModelConfig(self, **kw): return SimpleNamespace(**kw)
    def VertexPredictionEndpoint(self, **kw): return SimpleNamespace(**kw)
    def RagVectorDbConfig(self, **kw): return SimpleNamespace(**kw)
    def TransformationConfig(self, **kw): return SimpleNamespace(**kw)
    def ChunkingConfig(self, **kw): return SimpleNamespace(**kw)
    def RagResource(self, **kw): return SimpleNamespace(**kw)
    def RagRetrievalConfig(self, **kw): return SimpleNamespace(**kw)

    # --- corpus lifecycle ---
    def list_corpora(self):
        return list(self.corpora)

    def create_corpus(self, *, display_name, backend_config=None):
        self._seq += 1
        corpus = SimpleNamespace(name=f"corpora/{self._seq}", display_name=display_name)
        self.corpora.append(corpus)
        return corpus

    # --- files ---
    def upload_file(self, corpus_name, path, *, display_name, description=None):
        self._seq += 1
        with open(path, "rb") as fh:
            content = fh.read()
        rec = dict(corpus=corpus_name, display_name=display_name,
                   description=description, content=content)
        self.uploads.append(rec)
        f = SimpleNamespace(name=f"{corpus_name}/ragFiles/{self._seq}",
                            display_name=display_name, corpus=corpus_name,
                            file_status=SimpleNamespace(state="ACTIVE"))
        self.files.append(f)
        return f

    def import_files(self, corpus_name, paths, *, transformation_config=None,
                     max_embedding_requests_per_min=1000):
        self.imports.append(dict(corpus=corpus_name, paths=list(paths)))
        return SimpleNamespace(imported_rag_files_count=len(list(paths)))

    def list_files(self, corpus_name):
        return [f for f in self.files if f.corpus == corpus_name]

    def delete_file(self, name):
        self.deleted.append(name)
        self.files = [f for f in self.files if f.name != name]

    def retrieval_query(self, *, rag_resources, text, rag_retrieval_config=None):
        return SimpleNamespace(contexts=SimpleNamespace(contexts=list(self.query_contexts)))


def _backend(fake, **over) -> VertexRagBackend:
    init_calls = []
    kw = dict(project="proj", location="us-central1",
              embedding_model="text-embedding-005", corpus_prefix="scrumagent",
              chunk_size=512, chunk_overlap=100, max_concurrency=4,
              rag_sdk=fake, init_fn=lambda **k: init_calls.append(k))
    kw.update(over)
    b = VertexRagBackend(**kw)
    b._init_calls = init_calls  # exposed for assertions
    return b


def test_index_text_uploads_file_with_provenance_display_name():
    fake = FakeRag()
    b = _backend(fake)
    docs = [RagDocument(source_kind="jira", source_id="K-1", title="Login fails",
                        source_uri="https://x/K-1", text="cannot log in")]
    result = asyncio.run(b.index_documents("p1", docs))

    assert isinstance(result, IndexResult)
    assert result.submitted == 1
    # one corpus auto-created for the project
    assert [c.display_name for c in fake.corpora] == ["scrumagent-p1"]
    up = fake.uploads[0]
    assert up["display_name"] == "jira::K-1"
    assert up["content"].startswith(b"Login fails\nhttps://x/K-1\n\n")


def test_index_reuses_existing_corpus_per_project():
    fake = FakeRag()
    b = _backend(fake)
    docs = [RagDocument(source_kind="jira", source_id="K-1", title="t",
                        source_uri="u", text="a")]
    asyncio.run(b.index_documents("p1", docs))
    asyncio.run(b.index_documents("p1", docs))
    assert len(fake.corpora) == 1  # found-and-reused, not recreated


def test_index_multimodal_uploads_media_as_separate_file():
    fake = FakeRag()
    b = _backend(fake)
    docs = [RagDocument(source_kind="meeting", source_id="m-1", title="Standup",
                        source_uri="u", text="notes",
                        media=[RagMedia(mime_type="image/png", data=b"\x89PNG")])]
    asyncio.run(b.index_documents("p1", docs))
    names = sorted(u["display_name"] for u in fake.uploads)
    assert names == ["meeting::m-1", "meeting::m-1::media0"]
    img = next(u for u in fake.uploads if u["display_name"] == "meeting::m-1::media0")
    assert img["content"] == b"\x89PNG"


def test_index_media_uri_routes_to_import_files():
    fake = FakeRag()
    b = _backend(fake)
    docs = [RagDocument(source_kind="doc", source_id="d-1", title="Spec",
                        source_uri="u",
                        media=[RagMedia(mime_type="application/pdf",
                                        uri="gs://bucket/spec.pdf")])]
    asyncio.run(b.index_documents("p1", docs))
    assert fake.imports and fake.imports[0]["paths"] == ["gs://bucket/spec.pdf"]


def test_index_empty_is_noop_no_corpus():
    fake = FakeRag()
    b = _backend(fake)
    result = asyncio.run(b.index_documents("p1", []))
    assert result.submitted == 0
    assert fake.corpora == []


def test_noops_for_managed_backend():
    fake = FakeRag()
    b = _backend(fake)
    assert asyncio.run(b.pipeline_busy()) is False
    assert asyncio.run(b.failed_count()) == 0
    assert asyncio.run(b.reprocess_failed()) is None


def test_from_settings_requires_gcp_project_id():
    from app.config import Settings
    s = Settings(_env_file=None, secret_key="x", openai_api_key="k",
                 google_client_id="c", google_client_secret="s",
                 rag_provider="google", gcp_project_id=None)
    with pytest.raises(RagError):
        VertexRagBackend.from_settings(s)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest -q tests/test_rag_vertex.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.rag.vertex'`.

- [ ] **Step 3: Implement `backend/app/rag/vertex.py`** (write path + corpus + no-ops)

```python
"""App-owned Vertex AI RAG Engine adapter (multimodal). Implements the RagBackend
protocol. Project isolation is native: one corpus per project
(display_name = "{corpus_prefix}-{project_id}"). Provenance is the RagFile
display_name "{source_kind}::{source_id}". The vertexai.rag SDK is blocking, so
every call is wrapped in asyncio.to_thread; uploads are concurrency-bounded.
The SDK is lazy-imported and injectable (rag_sdk/init_fn) for tests."""
from __future__ import annotations

import asyncio
import mimetypes
import os
import tempfile
from collections.abc import Sequence

from app.config import Settings
from app.rag.base import (
    Citation,
    IndexResult,
    RagDocument,
    RagError,
    RagStatus,
    RetrievedPassage,
)


def _load_sdk():  # pragma: no cover - exercised only with the real SDK installed
    import vertexai
    from vertexai import rag
    return vertexai.init, rag


class VertexRagBackend:
    def __init__(
        self,
        *,
        project: str,
        location: str,
        embedding_model: str,
        corpus_prefix: str,
        chunk_size: int,
        chunk_overlap: int,
        max_concurrency: int,
        credentials_path: str | None = None,
        rag_sdk=None,
        init_fn=None,
    ) -> None:
        self._project = project
        self._location = location
        self._embedding_model = embedding_model
        self._corpus_prefix = corpus_prefix
        self._chunk_size = chunk_size
        self._chunk_overlap = chunk_overlap
        self._sem = asyncio.Semaphore(max_concurrency)
        self._credentials_path = credentials_path
        self._rag = rag_sdk
        self._init_fn = init_fn
        self._initialized = False
        self._corpus_cache: dict[str, str] = {}

    @classmethod
    def from_settings(cls, settings: Settings) -> "VertexRagBackend":
        if not settings.gcp_project_id:
            raise RagError("rag_provider=google requires GCP_PROJECT_ID")
        return cls(
            project=settings.gcp_project_id,
            location=settings.vertex_location,
            embedding_model=settings.vertex_embedding_model,
            corpus_prefix=settings.vertex_corpus_prefix,
            chunk_size=settings.vertex_chunk_size,
            chunk_overlap=settings.vertex_chunk_overlap,
            max_concurrency=settings.vertex_max_concurrency,
            credentials_path=settings.google_application_credentials,
        )

    # --- SDK access -------------------------------------------------------
    def _sdk(self):
        """Lazy-init the SDK once; return the rag module."""
        if self._rag is None or self._init_fn is None:
            init_fn, rag = _load_sdk()
            self._init_fn = self._init_fn or init_fn
            self._rag = self._rag or rag
        if not self._initialized:
            self._init_fn(project=self._project, location=self._location)
            self._initialized = True
        return self._rag

    async def _call(self, fn, *args, **kwargs):
        """Run a blocking SDK call off the event loop, mapping errors to RagError."""
        try:
            return await asyncio.to_thread(fn, *args, **kwargs)
        except RagError:
            raise
        except Exception as exc:  # noqa: BLE001 — SDK/transport errors are opaque
            raise RagError(f"vertex call failed: {exc}") from exc

    # --- corpus per project ----------------------------------------------
    def _corpus_display_name(self, project_id: str) -> str:
        return f"{self._corpus_prefix}-{project_id}"

    async def _ensure_corpus(self, project_id: str) -> str:
        cached = self._corpus_cache.get(project_id)
        if cached:
            return cached
        rag = self._sdk()
        want = self._corpus_display_name(project_id)
        existing = await self._call(rag.list_corpora)
        for corpus in existing:
            if getattr(corpus, "display_name", None) == want:
                self._corpus_cache[project_id] = corpus.name
                return corpus.name
        embedding = rag.RagEmbeddingModelConfig(
            vertex_prediction_endpoint=rag.VertexPredictionEndpoint(
                publisher_model=(
                    f"publishers/google/models/{self._embedding_model}"
                )
            )
        )
        corpus = await self._call(
            rag.create_corpus,
            display_name=want,
            backend_config=rag.RagVectorDbConfig(rag_embedding_model_config=embedding),
        )
        self._corpus_cache[project_id] = corpus.name
        return corpus.name

    # --- write path -------------------------------------------------------
    async def index_documents(
        self, project_id: str, documents: Sequence[RagDocument]
    ) -> IndexResult:
        docs = list(documents)
        if not docs:
            return IndexResult(submitted=0)
        corpus = await self._ensure_corpus(project_id)
        rag = self._sdk()

        async def upload_bytes(display_name, description, content, suffix):
            async with self._sem:
                with tempfile.TemporaryDirectory() as tmp:
                    path = os.path.join(tmp, f"f{suffix}")
                    with open(path, "wb") as fh:
                        fh.write(content)
                    await self._call(
                        rag.upload_file, corpus, path,
                        display_name=display_name, description=description,
                    )

        tasks = []
        for doc in docs:
            base_name = f"{doc.source_kind}::{doc.source_id}"
            description = f"{doc.title}\n{doc.source_uri}"
            if doc.text is not None:
                body = f"{doc.title}\n{doc.source_uri}\n\n{doc.text}".encode("utf-8")
                tasks.append(upload_bytes(base_name, description, body, ".txt"))
            for n, media in enumerate(doc.media):
                if media.data is not None:
                    suffix = mimetypes.guess_extension(media.mime_type) or ".bin"
                    tasks.append(
                        upload_bytes(f"{base_name}::media{n}", description,
                                     media.data, suffix)
                    )
                elif media.uri:
                    tasks.append(
                        self._call(rag.import_files, corpus, [media.uri])
                    )

        results = await asyncio.gather(*tasks, return_exceptions=True)
        errors = [str(r) for r in results if isinstance(r, Exception)]
        submitted = len(results) - len(errors)
        return IndexResult(submitted=submitted, failed=len(errors), errors=errors)

    # --- LightRAG-shaped methods: honest no-ops on a managed backend ------
    async def pipeline_busy(self) -> bool:
        return False

    async def failed_count(self) -> int:
        return 0

    async def reprocess_failed(self) -> None:
        return None
```

- [ ] **Step 4: Run the write-path tests**

Run: `cd backend && uv run pytest -q tests/test_rag_vertex.py`
Expected: PASS (7 tests).

- [ ] **Step 5: Add a factory google-branch test** — append to `backend/tests/test_rag_factory.py`:

```python
def test_factory_returns_vertex_for_google():
    from app.rag.vertex import VertexRagBackend
    s = _settings(rag_provider="google", gcp_project_id="proj-123")
    assert isinstance(build_rag_client(s), VertexRagBackend)
```

Run: `cd backend && uv run pytest -q tests/test_rag_factory.py`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/app/rag/vertex.py backend/tests/test_rag_vertex.py backend/tests/test_rag_factory.py && \
rtk git commit -m "feat(rag): VertexRagBackend write path — corpus-per-project, multimodal upload, no-ops (ScrumAgent-65g)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4b: `VertexRagBackend` — read path (`retrieve`) + management (`clear_project`, `clear_source`, `status`)

**Files:**
- Modify: `backend/app/rag/vertex.py` (add the four methods)
- Modify: `backend/tests/test_rag_vertex.py` (add read/management tests)

**Interfaces:**
- Consumes: everything from Task 4 + `Citation`, `RagStatus`, `RetrievedPassage`.
- Produces: `VertexRagBackend.retrieve/clear_project/clear_source/status` — completing the `RagBackend` surface.

- [ ] **Step 1: Write the failing read/management tests** — append to `backend/tests/test_rag_vertex.py`

```python
def test_retrieve_maps_contexts_to_passages_with_citations():
    fake = FakeRag()
    fake.query_contexts = [
        SimpleNamespace(text="Login fails on mobile.", source_uri="u1",
                        source_display_name="jira::PLAT-12", score=0.81),
        SimpleNamespace(text="Release notes.", source_uri="u2",
                        source_display_name="notion::page-7", score=0.55),
    ]
    b = _backend(fake)
    out = asyncio.run(b.retrieve("p1", "why login fails", k=4))
    assert [p.text for p in out] == ["Login fails on mobile.", "Release notes."]
    assert out[0].score == 0.81
    assert out[0].citation == Citation(source_kind="jira", source_id="PLAT-12")
    assert out[1].citation.source_kind == "notion"


def test_retrieve_drops_uncited_contexts():
    fake = FakeRag()
    fake.query_contexts = [
        SimpleNamespace(text="kept", source_uri="u", source_display_name="jira::A", score=0.3),
        SimpleNamespace(text="nodisplay", source_uri="u", source_display_name="", score=0.2),
        SimpleNamespace(text="partial", source_uri="u", source_display_name="jira", score=0.1),
    ]
    b = _backend(fake)
    out = asyncio.run(b.retrieve("p1", "q", k=4))
    assert [p.text for p in out] == ["kept"]


def test_clear_project_deletes_all_files_in_corpus():
    fake = FakeRag()
    b = _backend(fake)
    docs = [RagDocument(source_kind="jira", source_id=f"K-{i}", title="t",
                        source_uri="u", text="x") for i in range(3)]
    asyncio.run(b.index_documents("p1", docs))
    count = asyncio.run(b.clear_project("p1"))
    assert count == 3
    assert fake.list_files(fake.corpora[0].name) == []


def test_clear_source_deletes_only_matching_display_name():
    fake = FakeRag()
    b = _backend(fake)
    docs = [
        RagDocument(source_kind="note", source_id="msg-1", title="t", source_uri="u", text="a"),
        RagDocument(source_kind="note", source_id="msg-2", title="t", source_uri="u", text="b"),
        RagDocument(source_kind="jira", source_id="msg-1", title="t", source_uri="u", text="c"),
    ]
    asyncio.run(b.index_documents("p1", docs))
    count = asyncio.run(b.clear_source("p1", "note", "msg-1"))
    assert count == 1
    remaining = sorted(f.display_name for f in fake.list_files(fake.corpora[0].name))
    assert remaining == ["jira::msg-1", "note::msg-2"]


def test_status_counts_total_and_by_source_kind():
    fake = FakeRag()
    b = _backend(fake)
    docs = [
        RagDocument(source_kind="jira", source_id="A", title="t", source_uri="u", text="a"),
        RagDocument(source_kind="jira", source_id="B", title="t", source_uri="u", text="b"),
        RagDocument(source_kind="notion", source_id="C", title="t", source_uri="u", text="c"),
    ]
    asyncio.run(b.index_documents("p1", docs))
    status = asyncio.run(b.status("p1"))
    assert status.total == 3
    assert status.by_source_kind == {"jira": 2, "notion": 1}
    assert status.by_status == {"active": 3}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest -q tests/test_rag_vertex.py -k "retrieve or clear or status"`
Expected: FAIL — `AttributeError: 'VertexRagBackend' object has no attribute 'retrieve'`.

- [ ] **Step 3: Add the read/management methods** to `backend/app/rag/vertex.py` (before the no-op methods). Add `from app.rag.base import _parse_citation` to the imports.

```python
    # --- read path --------------------------------------------------------
    async def retrieve(
        self, project_id: str, question: str, *, k: int = 6
    ) -> list[RetrievedPassage]:
        corpus = await self._ensure_corpus(project_id)
        rag = self._sdk()
        response = await self._call(
            rag.retrieval_query,
            rag_resources=[rag.RagResource(rag_corpus=corpus)],
            text=question,
            rag_retrieval_config=rag.RagRetrievalConfig(top_k=k),
        )
        passages: list[RetrievedPassage] = []
        for ctx in self._iter_contexts(response):
            citation = _parse_vertex_citation(
                getattr(ctx, "source_display_name", "") or ""
            )
            if citation is None:
                continue   # corpus is the project boundary; drop only uncited hits
            passages.append(
                RetrievedPassage(
                    text=getattr(ctx, "text", "") or "",
                    score=float(getattr(ctx, "score", 0.0) or 0.0),
                    citation=citation,
                )
            )
        return passages

    @staticmethod
    def _iter_contexts(response):
        """RetrieveContextsResponse exposes contexts at response.contexts.contexts;
        tolerate a flat list too. Confirmed against the SDK during implementation."""
        inner = getattr(response, "contexts", None)
        if inner is None:
            return []
        return getattr(inner, "contexts", None) or (inner if isinstance(inner, list) else [])

    # --- management -------------------------------------------------------
    async def _files(self, corpus: str):
        rag = self._sdk()
        return list(await self._call(rag.list_files, corpus))

    async def _delete_matching(self, project_id: str, predicate) -> int:
        corpus = await self._ensure_corpus(project_id)
        rag = self._sdk()
        targets = [f for f in await self._files(corpus)
                   if predicate(getattr(f, "display_name", "") or "")]
        for f in targets:
            await self._call(rag.delete_file, f.name)
        return len(targets)

    async def clear_project(self, project_id: str) -> int:
        return await self._delete_matching(project_id, lambda _name: True)

    async def clear_source(
        self, project_id: str, source_kind: str, source_id: str
    ) -> int:
        base = f"{source_kind}::{source_id}"
        return await self._delete_matching(
            project_id, lambda name: name == base or name.startswith(f"{base}::")
        )

    async def status(self, project_id: str) -> RagStatus:
        corpus = await self._ensure_corpus(project_id)
        by_status: dict[str, int] = {}
        by_source_kind: dict[str, int] = {}
        total = 0
        for f in await self._files(corpus):
            total += 1
            state = getattr(getattr(f, "file_status", None), "state", None) or "active"
            key = str(state).lower()
            by_status[key] = by_status.get(key, 0) + 1
            name = getattr(f, "display_name", "") or ""
            kind = name.split("::", 1)[0]
            if kind:
                by_source_kind[kind] = by_source_kind.get(kind, 0) + 1
        return RagStatus(total=total, by_status=by_status, by_source_kind=by_source_kind)
```

Add this module-level helper near the top of `vertex.py` (after `_load_sdk`):

```python
def _parse_vertex_citation(display_name: str) -> Citation | None:
    """display_name is "{kind}::{id}" (media: "{kind}::{id}::media{n}"); first two
    segments are the provenance. None if either is missing."""
    parts = display_name.split("::")
    if len(parts) < 2 or not parts[0] or not parts[1]:
        return None
    return Citation(source_kind=parts[0], source_id=parts[1])
```

- [ ] **Step 4: Run the Vertex tests**

Run: `cd backend && uv run pytest -q tests/test_rag_vertex.py`
Expected: PASS (12 tests).

- [ ] **Step 5: Verify the protocol conformance for Vertex** — append to `backend/tests/test_rag_vertex.py`

```python
def test_vertex_backend_satisfies_protocol():
    from app.rag import RagBackend
    assert isinstance(_backend(FakeRag()), RagBackend)
```

Run: `cd backend && uv run pytest -q tests/test_rag_vertex.py::test_vertex_backend_satisfies_protocol`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/app/rag/vertex.py backend/tests/test_rag_vertex.py && \
rtk git commit -m "feat(rag): VertexRagBackend read path + management (retrieve/clear/status) (ScrumAgent-65g)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Optional dependency, docs, and close-out

**Files:**
- Create: `backend/requirements-google.txt`
- Modify: `backend/requirements.txt` (pointer comment)
- Modify: `wiki/modules/rag.md`
- Create: `wiki/decisions/2026-06-19-rag-provider-protocol.md`
- Modify: `wiki/concepts/lightrag-multimodal.md`
- Modify: `wiki/decisions/_index.md` and `wiki/index.md` (link the new decision)

- [ ] **Step 1: Create `backend/requirements-google.txt`**

```
# Vertex AI RAG Engine adapter deps (ScrumAgent-65g). Installed only when
# RAG_PROVIDER=google: `pip install -r requirements-google.txt`. Kept out of the
# lean default set (see requirements.txt) so the default image stays small.
google-cloud-aiplatform[rag]>=1.71,<2.0
```

- [ ] **Step 2: Add a pointer** to `backend/requirements.txt` under the existing "Heavy/feature deps" note:

```
# --- optional: Vertex AI RAG Engine (RAG_PROVIDER=google) ---
# See requirements-google.txt — not installed by default (lean image).
```

- [ ] **Step 3: Update `wiki/modules/rag.md`** — replace the single-implementation framing with the protocol + two backends. Add a "Backends" section documenting `LightRagBackend` (text-only; media → `RagError`) and `VertexRagBackend` (multimodal; corpus-per-project native isolation → notes that `o39` is a non-issue on the Vertex path; `pipeline_busy`/`failed_count`/`reprocess_failed` are no-ops). Note `build_rag_client(settings)` + the `rag_provider` config. Bump `updated:` to `2026-06-19` and `path:` to `backend/app/rag/` (package).

- [ ] **Step 4: Create `wiki/decisions/2026-06-19-rag-provider-protocol.md`** capturing: the unified `RagBackend` protocol, two adapters, the multimodal `RagDocument` model, Vertex corpus-per-project isolation, Approach A (fat protocol + honest no-ops) and why, `upload_file`-per-file vs GCS-staging trade-off (and that GCS-staging is the future bulk optimization), and that the Vertex path is dormant by default (`rag_provider=lightrag`). Link `[[modules/rag]]`, `[[concepts/lightrag-multimodal]]`, and reference `ScrumAgent-65g` / `ScrumAgent-o39`.

- [ ] **Step 5: Update `wiki/concepts/lightrag-multimodal.md`** — add a note that, as of 2026-06-19, the multimodal ingestion path is the Vertex adapter; LightRAG stays text-only and rejects `media`. Bump `updated:`.

- [ ] **Step 6: Link the decision** from `wiki/decisions/_index.md` and `wiki/index.md`.

- [ ] **Step 7: Run the full suite once more**

Run: `cd backend && uv run pytest -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add backend/requirements.txt backend/requirements-google.txt wiki/ && \
rtk git commit -m "docs(rag): document RagBackend protocol + two adapters; optional Vertex deps (ScrumAgent-65g)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 9: Close the issue**

Run: `rtk bd close ScrumAgent-65g`

---

## Self-Review

**Spec coverage:**
- Module structure (`base`/`lightrag`/`vertex`/`factory`/`__init__`) → Tasks 1, 3, 4.
- Multimodal `RagDocument` + `RagMedia` → Task 2.
- `RagBackend` protocol (8 methods, `runtime_checkable`) → Task 2 + conformance tests (Task 2 LightRAG, Task 4b Vertex).
- LightRAG media → `RagError` → Task 2.
- Vertex: corpus-per-project, provenance via display_name, async wrap + semaphore, multimodal upload, retrieve without cross-project filter, clear/status, no-ops → Tasks 4, 4b.
- Config `rag_provider` + Vertex settings; `build_rag_client`; rewire 5 sites → Task 3.
- Optional dependency, wiki/decision docs → Task 5.
- Out-of-scope items (live GCP, `index_meeting`, multimodal LightRAG, GCS-staging, DB migration) are not implemented — correct.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to" — every code step shows full code; `_load_sdk` is the only `# pragma: no cover` (real-SDK-only) and is intentional, not a placeholder.

**Type consistency:** `LightRagBackend`, `VertexRagBackend`, `RagBackend`, `RagMedia`, `RagDocument(source_kind, source_id, title, source_uri, text=None, media=[])`, `build_rag_client`, `IndexResult(submitted, track_id=None, failed=0, errors=[])`, `Citation(source_kind, source_id, title=None, source_uri=None)`, display_name `"{kind}::{id}"` / `"{kind}::{id}::media{n}"`, `_parse_vertex_citation`, fake-SDK method names (`list_corpora`/`create_corpus`/`upload_file`/`import_files`/`list_files`/`delete_file`/`retrieval_query`) — consistent across tasks and tests.
