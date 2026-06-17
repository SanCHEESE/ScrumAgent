from __future__ import annotations

import asyncio

import httpx

from app.rag import IndexResult, RagClient, RagDocument, RagError, RagStatus


def _client(handler, *, api_key=None) -> RagClient:
    return RagClient(
        "http://lightrag:9621",
        api_key=api_key,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


def test_index_documents_posts_texts_with_file_source_tags():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
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
            return httpx.Response(200, json={"status": "ok"})
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
