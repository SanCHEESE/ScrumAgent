from __future__ import annotations

import asyncio

import httpx

from app.rag import Citation, IndexResult, LightRagBackend, RagDocument, RagError, RagStatus, RetrievedPassage


def _client(handler, *, api_key=None) -> LightRagBackend:
    return LightRagBackend(
        "http://lightrag:9621",
        api_key=api_key,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


def test_index_documents_posts_texts_with_file_source_tags():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/documents/pipeline_status":
            return httpx.Response(200, json={"busy": False, "request_pending": False})
        assert request.url.path == "/documents/texts"
        seen["body"] = httpx.Request("POST", request.url, content=request.content).read()
        import json

        seen["json"] = json.loads(seen["body"])
        return httpx.Response(200, json={"status": "ok", "message": "queued", "track_id": "trk-1"})

    docs = [
        RagDocument(
            text="Cannot log in on mobile.",
            source_kind="jira",
            source_id="PLAT-12",
            title="Login fails",
            source_uri="https://m.atlassian.net/browse/PLAT-12",
        )
    ]
    result = asyncio.run(_client(handler).index_documents("proj-1", docs))

    assert isinstance(result, IndexResult)
    assert result.submitted == 1
    assert result.track_id == "trk-1"
    assert seen["json"]["file_sources"] == ["proj-1::jira::PLAT-12"]
    # title + uri are prepended into the indexed text body
    assert seen["json"]["texts"][0].startswith("Login fails\nhttps://m.atlassian.net/browse/PLAT-12\n\n")


def test_index_documents_applies_api_key_query_param():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["api_key"] = request.url.params.get("api_key_header_value")
        return httpx.Response(200, json={"status": "ok", "message": "", "track_id": "t"})

    docs = [RagDocument(text="x", source_kind="notion", source_id="p1", title="P1", source_uri="u")]
    asyncio.run(_client(handler, api_key="secret").index_documents("proj-1", docs))
    assert captured["api_key"] == "secret"


def test_index_documents_empty_is_noop():
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("should not call LightRAG for empty docs")

    result = asyncio.run(_client(handler).index_documents("proj-1", []))
    assert result.submitted == 0


def test_pipeline_busy_reflects_status_flag():
    def busy(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/documents/pipeline_status"
        return httpx.Response(200, json={"busy": True})

    def idle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"busy": False})

    assert asyncio.run(_client(busy).pipeline_busy()) is True
    assert asyncio.run(_client(idle).pipeline_busy()) is False


def test_pipeline_busy_raises_ragerror_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={})

    try:
        asyncio.run(_client(handler).pipeline_busy())
        raise AssertionError("expected RagError")
    except RagError:
        pass


def test_index_documents_raises_ragerror_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"detail": "boom"})

    docs = [RagDocument(text="x", source_kind="jira", source_id="K-1", title="t", source_uri="u")]
    try:
        asyncio.run(_client(handler).index_documents("proj-1", docs))
        raise AssertionError("expected RagError")
    except RagError:
        pass


def test_index_documents_wraps_malformed_json_as_ragerror():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not json")

    docs = [RagDocument(text="x", source_kind="jira", source_id="K-1", title="t", source_uri="u")]
    try:
        asyncio.run(_client(handler).index_documents("proj-1", docs))
        raise AssertionError("expected RagError")
    except RagError:
        pass


def _paginated_handler(documents, *, deleted):
    """Serve /documents/paginated (one page) and capture deletes."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/documents/pipeline_status":
            return httpx.Response(200, json={"busy": False, "request_pending": False})
        if request.url.path == "/documents/paginated":
            return httpx.Response(
                200,
                json={
                    "documents": documents,
                    "pagination": {"total_pages": 1},
                    "status_counts": {},
                },
            )
        if request.url.path == "/documents/delete_document":
            import json

            body = json.loads(httpx.Request("DELETE", request.url, content=request.content).read())
            deleted.extend(body["doc_ids"])
            return httpx.Response(200, json={"status": "deletion_started"})
        raise AssertionError(f"unexpected path {request.url.path}")

    return handler


def test_clear_project_deletes_only_matching_prefix():
    docs = [
        {"id": "doc-a", "file_path": "proj-1::jira::PLAT-1", "status": "processed"},
        {"id": "doc-b", "file_path": "proj-2::jira::OTHER-1", "status": "processed"},
        {"id": "doc-c", "file_path": "proj-1::notion::abc", "status": "processed"},
    ]
    deleted: list[str] = []
    count = asyncio.run(_client(_paginated_handler(docs, deleted=deleted)).clear_project("proj-1"))
    assert count == 2
    assert sorted(deleted) == ["doc-a", "doc-c"]


def test_status_counts_by_status_for_project():
    docs = [
        {"id": "1", "file_path": "proj-1::jira::A", "status": "processed"},
        {"id": "2", "file_path": "proj-1::jira::B", "status": "pending"},
        {"id": "3", "file_path": "proj-9::jira::C", "status": "processed"},
    ]
    status = asyncio.run(_client(_paginated_handler(docs, deleted=[])).status("proj-1"))
    assert isinstance(status, RagStatus)
    assert status.total == 2
    assert status.by_status == {"processed": 1, "pending": 1}


def test_status_counts_by_source_kind_for_project():
    docs = [
        {"id": "1", "file_path": "proj-1::jira::A", "status": "processed"},
        {"id": "2", "file_path": "proj-1::jira::B", "status": "pending"},
        {"id": "3", "file_path": "proj-1::notion::C", "status": "processed"},
        {"id": "4", "file_path": "proj-9::jira::D", "status": "processed"},
    ]
    status = asyncio.run(_client(_paginated_handler(docs, deleted=[])).status("proj-1"))
    # The kind is the middle segment of "{project_id}::{kind}::{id}".
    assert status.by_source_kind == {"jira": 2, "notion": 1}


# --- Re-sync race against LightRAG's single-flight pipeline (ScrumAgent-srp) ---
#
# LightRAG processes deletes ASYNC: DELETE /documents/delete_document returns 200
# with status="deletion_started" while the work keeps draining (busy=True), and
# returns status="busy" (still 200!) when it could not even start. A POST insert
# arriving while a delete drains gets HTTP 409. The adapter must poll
# /documents/pipeline_status until busy=false and treat busy/409 as retryable.


async def _noop_sleep(_seconds: float) -> None:
    return None


def _race_client(
    handler, *, api_key=None, busy_retries=5, poll_interval=0.001, max_wait=0.05
) -> LightRagBackend:
    return LightRagBackend(
        "http://lightrag:9621",
        api_key=api_key,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        poll_interval=poll_interval,
        max_wait=max_wait,
        busy_retries=busy_retries,
        sleep=_noop_sleep,
    )


class _FakeLightRAG:
    """Stateful mock of the v1.5.3 document pipeline for race tests.

    - pipeline_status reports busy while ``pipeline_polls < _busy_until``.
    - a delete reports status="busy" the first ``delete_busy_times`` calls, then
      "deletion_started" and (modelling the async drain) keeps the pipeline busy
      for ``drain_polls`` subsequent status reads.
    - an insert returns 409 the first ``insert_409_times`` calls, then 200.
    """

    def __init__(
        self,
        *,
        documents=None,
        initial_busy_polls=0,
        drain_polls=0,
        delete_busy_times=0,
        insert_409_times=0,
    ):
        self.documents = documents or []
        self.drain_polls = drain_polls
        self.delete_busy_times = delete_busy_times
        self.insert_409_times = insert_409_times
        self._busy_until = initial_busy_polls
        self.pipeline_polls = 0
        self.delete_calls = 0
        self.insert_calls = 0
        self.deleted: list[str] = []
        self.events: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        import json

        path = request.url.path
        self.events.append(path.rsplit("/", 1)[-1])

        if path == "/documents/pipeline_status":
            busy = self.pipeline_polls < self._busy_until
            self.pipeline_polls += 1
            return httpx.Response(200, json={"busy": busy, "request_pending": False})

        if path == "/documents/paginated":
            return httpx.Response(
                200,
                json={
                    "documents": self.documents,
                    "pagination": {"total_pages": 1},
                    "status_counts": {},
                },
            )

        if path == "/documents/delete_document":
            self.delete_calls += 1
            if self.delete_calls <= self.delete_busy_times:
                return httpx.Response(
                    200,
                    json={"status": "busy", "message": "pipeline busy", "doc_id": ""},
                )
            body = json.loads(
                httpx.Request("DELETE", request.url, content=request.content).read()
            )
            self.deleted.extend(body["doc_ids"])
            # deletion now drains asynchronously: pipeline stays busy a while.
            self._busy_until = self.pipeline_polls + self.drain_polls
            return httpx.Response(
                200,
                json={"status": "deletion_started", "message": "ok", "doc_id": ""},
            )

        if path == "/documents/texts":
            self.insert_calls += 1
            if self.insert_calls <= self.insert_409_times:
                return httpx.Response(
                    409, json={"detail": "Pipeline is clearing or deleting documents."}
                )
            return httpx.Response(
                200, json={"status": "success", "message": "queued", "track_id": "trk-1"}
            )

        raise AssertionError(f"unexpected path {path}")


def test_index_documents_retries_on_409_until_pipeline_accepts():
    fake = _FakeLightRAG(insert_409_times=2)
    docs = [RagDocument(text="x", source_kind="jira", source_id="K-1", title="t", source_uri="u")]
    result = asyncio.run(_race_client(fake).index_documents("proj-1", docs))
    assert result.submitted == 1
    assert result.track_id == "trk-1"
    assert fake.insert_calls == 3  # 409, 409, then 200


def test_index_documents_raises_after_persistent_409():
    fake = _FakeLightRAG(insert_409_times=99)
    docs = [RagDocument(text="x", source_kind="jira", source_id="K-1", title="t", source_uri="u")]
    try:
        asyncio.run(_race_client(fake, busy_retries=3).index_documents("proj-1", docs))
        raise AssertionError("expected RagError after exhausting 409 retries")
    except RagError:
        pass
    assert fake.insert_calls == 4  # initial attempt + 3 retries


def test_index_documents_waits_for_pipeline_idle_before_posting():
    # Pipeline busy for the first two status reads, then idle.
    fake = _FakeLightRAG(initial_busy_polls=2)
    docs = [RagDocument(text="x", source_kind="jira", source_id="K-1", title="t", source_uri="u")]
    result = asyncio.run(_race_client(fake).index_documents("proj-1", docs))
    assert result.submitted == 1
    assert fake.pipeline_polls >= 3  # waited out the busy window before inserting
    # the insert happened only after the pipeline reported idle
    assert fake.events.index("texts") > fake.events.index("pipeline_status")


def test_index_documents_times_out_when_pipeline_never_idle():
    fake = _FakeLightRAG(initial_busy_polls=10_000)
    docs = [RagDocument(text="x", source_kind="jira", source_id="K-1", title="t", source_uri="u")]
    try:
        asyncio.run(_race_client(fake, poll_interval=0.001, max_wait=0.005).index_documents("proj-1", docs))
        raise AssertionError("expected RagError when pipeline never idles")
    except RagError:
        pass
    assert fake.insert_calls == 0  # never posted into a busy pipeline


def test_clear_project_retries_busy_delete_instead_of_dropping_batch():
    docs = [{"id": "doc-a", "file_path": "proj-1::jira::A", "status": "processed"}]
    fake = _FakeLightRAG(documents=docs, delete_busy_times=2)
    count = asyncio.run(_race_client(fake).clear_project("proj-1"))
    assert count == 1
    assert fake.deleted == ["doc-a"]  # NOT silently dropped on status="busy"
    assert fake.delete_calls == 3  # busy, busy, then deletion_started


def test_clear_project_drains_pipeline_before_returning():
    docs = [{"id": "doc-a", "file_path": "proj-1::jira::A", "status": "processed"}]
    # After the delete is accepted the pipeline stays busy for 3 status reads.
    fake = _FakeLightRAG(documents=docs, drain_polls=3)
    asyncio.run(_race_client(fake).clear_project("proj-1"))
    assert fake.deleted == ["doc-a"]
    # clear must poll pipeline_status AFTER the last delete (drain) before returning.
    last_delete = len(fake.events) - 1 - fake.events[::-1].index("delete_document")
    assert "pipeline_status" in fake.events[last_delete + 1 :]


# --- Retrieve (read side) ---


def _query_handler(references):
    """Serve POST /query (only_need_context) in LightRAG v1.5.3's real response
    shape: {"response": ..., "references": [{reference_id, file_path, content:[...]}]}.
    Confirmed against the live /openapi.json QueryResponse (ScrumAgent-uzx)."""
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/query"
        import json
        body = json.loads(request.content)
        assert body["only_need_context"] is True
        # references + per-reference chunk text only come back when requested.
        assert body["include_references"] is True
        assert body["include_chunk_content"] is True
        return httpx.Response(200, json={"response": "ctx", "references": references})
    return handler


def test_retrieve_returns_passages_with_parsed_citations():
    references = [
        {"reference_id": "1", "file_path": "proj-1::jira::PLAT-12",
         "content": ["Login fails on mobile."]},
        {"reference_id": "2", "file_path": "proj-1::notion::page-7",
         "content": ["Release notes v2."]},
    ]
    out = asyncio.run(_client(_query_handler(references)).retrieve("proj-1", "why login fails", k=4))
    assert [type(p) for p in out] == [RetrievedPassage, RetrievedPassage]
    assert out[0].text == "Login fails on mobile."
    # LightRAG /query carries no per-reference score; passages keep retrieval order.
    assert out[0].score == 0.0
    assert out[0].citation == Citation(source_kind="jira", source_id="PLAT-12", title=None, source_uri=None)
    assert out[1].citation.source_kind == "notion"


def test_retrieve_joins_multiple_chunk_contents_per_reference():
    references = [
        {"reference_id": "1", "file_path": "proj-1::jira::PLAT-12",
         "content": ["First chunk.", "Second chunk."]},
    ]
    out = asyncio.run(_client(_query_handler(references)).retrieve("proj-1", "q", k=4))
    assert out[0].text == "First chunk.\n\nSecond chunk."


def test_retrieve_drops_cross_project_and_uncited_hits():
    references = [
        {"reference_id": "1", "file_path": "proj-1::jira::A", "content": ["mine"]},
        {"reference_id": "2", "file_path": "proj-2::jira::B", "content": ["other project"]},
        {"reference_id": "3", "file_path": "", "content": ["no provenance"]},
        {"reference_id": "4", "file_path": "proj-1::jira", "content": ["partial provenance"]},
    ]
    out = asyncio.run(_client(_query_handler(references)).retrieve("proj-1", "q", k=4))
    assert [p.text for p in out] == ["mine"]


def test_retrieve_empty_on_no_hits():
    out = asyncio.run(_client(_query_handler([])).retrieve("proj-1", "q", k=4))
    assert out == []


def test_retrieve_raises_ragerror_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"detail": "boom"})
    try:
        asyncio.run(_client(handler).retrieve("proj-1", "q"))
        raise AssertionError("expected RagError")
    except RagError:
        pass


# --- clear_source: exact-file_source delete for Remember dedup (ScrumAgent-o39) ---


def test_clear_source_deletes_only_exact_file_source():
    docs = [
        {"id": "a", "file_path": "proj-1::note::msg-1", "status": "processed"},
        {"id": "b", "file_path": "proj-1::note::msg-2", "status": "processed"},   # other msg
        {"id": "c", "file_path": "proj-1::jira::msg-1", "status": "processed"},    # other kind
    ]
    deleted: list[str] = []
    count = asyncio.run(
        _client(_paginated_handler(docs, deleted=deleted)).clear_source("proj-1", "note", "msg-1")
    )
    assert count == 1
    assert deleted == ["a"]


# --- Auto-heal: global failed-count probe + reprocess_failed (ScrumAgent-clo) ---
#
# reprocess_failed and status_counts are INSTANCE-WIDE (no project filter, no body —
# verified live against /openapi.json). The auto-heal uses failed_count() to decide
# whether to retry, and reprocess_failed() to re-embed failed docs in place.


def test_failed_count_reads_global_status_counts():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/documents/status_counts"
        return httpx.Response(
            200, json={"status_counts": {"processed": 10, "failed": 3, "all": 13}}
        )

    assert asyncio.run(_client(handler).failed_count()) == 3


def test_failed_count_zero_when_failed_key_absent():
    def handler(request: httpx.Request) -> httpx.Response:
        # LightRAG omits the "failed" key entirely when nothing has failed.
        return httpx.Response(200, json={"status_counts": {"processed": 13, "all": 13}})

    assert asyncio.run(_client(handler).failed_count()) == 0


def test_failed_count_raises_ragerror_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={})

    try:
        asyncio.run(_client(handler).failed_count())
        raise AssertionError("expected RagError")
    except RagError:
        pass


def test_reprocess_failed_posts_endpoint():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["path"] = request.url.path
        return httpx.Response(200, json={"status": "success", "message": "reprocessing"})

    asyncio.run(_client(handler).reprocess_failed())
    assert seen["method"] == "POST"
    assert seen["path"] == "/documents/reprocess_failed"


def test_reprocess_failed_applies_api_key():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["api_key"] = request.url.params.get("api_key_header_value")
        return httpx.Response(200, json={"status": "success"})

    asyncio.run(_client(handler, api_key="secret").reprocess_failed())
    assert captured["api_key"] == "secret"


def test_reprocess_failed_raises_ragerror_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"detail": "boom"})

    try:
        asyncio.run(_client(handler).reprocess_failed())
        raise AssertionError("expected RagError")
    except RagError:
        pass
