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


def _parse_vertex_citation(display_name: str) -> Citation | None:
    """display_name is "{kind}::{id}" (media: "{kind}::{id}::media{n}"); first two
    segments are the provenance. None if either is missing."""
    parts = display_name.split("::")
    if len(parts) < 2 or not parts[0] or not parts[1]:
        return None
    return Citation(source_kind=parts[0], source_id=parts[1])


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

        async def import_uri(uri):
            async with self._sem:
                await self._call(rag.import_files, corpus, [uri])

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
                    tasks.append(import_uri(media.uri))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        errors = [str(r) for r in results if isinstance(r, Exception)]
        submitted = len(results) - len(errors)
        return IndexResult(submitted=submitted, failed=len(errors), errors=errors)

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

    # --- LightRAG-shaped methods: honest no-ops on a managed backend ------
    async def pipeline_busy(self) -> bool:
        return False

    async def failed_count(self) -> int:
        return 0

    async def reprocess_failed(self) -> None:
        return None
