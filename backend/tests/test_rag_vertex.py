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
