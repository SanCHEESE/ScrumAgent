from __future__ import annotations

import asyncio

import httpx

from app.jira_client import JiraReadClient, adf_to_text


def test_adf_to_text_flattens_paragraphs_and_lists():
    adf = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Hello world"}]},
            {
                "type": "bulletList",
                "content": [
                    {"type": "listItem", "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "one"}]}]},
                    {"type": "listItem", "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "two"}]}]},
                ],
            },
        ],
    }
    out = adf_to_text(adf)
    assert "Hello world" in out
    assert "one" in out and "two" in out


def _issue(n: int) -> dict:
    return {
        "key": f"PLAT-{n}",
        "fields": {
            "summary": f"Issue {n}",
            "description": {"type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Body"}]}]},
            "comment": {"comments": [
                {"body": {"type": "doc", "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "A comment"}]}]}}]},
            "status": {"name": "Open"},
            "issuetype": {"name": "Bug"},
            "updated": "2026-06-01T10:00:00.000+0000",
        },
    }


def _two_page_handler() -> "callable":
    """Jira Cloud enhanced search: POST /rest/api/3/search/jql, nextPageToken paging."""
    import json

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/api/3/search/jql"
        assert request.method == "POST"
        body = json.loads(request.content)
        assert 'project = "PLAT"' in body["jql"]
        assert isinstance(body["fields"], list)  # array in body, not a comma string
        token = body.get("nextPageToken")
        if token is None:  # first page
            return httpx.Response(200, json={"issues": [_issue(1)], "nextPageToken": "p2"})
        assert token == "p2"  # second page driven by the returned token
        return httpx.Response(200, json={"issues": [_issue(2)], "isLast": True})

    return handler


def test_fetch_issues_paginates_and_normalizes():
    client = JiraReadClient(
        "https://m.atlassian.net/",
        "agent@municorn.com",
        "tok",
        page_size=1,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(_two_page_handler())),
    )
    docs = asyncio.run(client.fetch_issues("PLAT"))
    assert [d.source_id for d in docs] == ["PLAT-1", "PLAT-2"]
    first = docs[0]
    assert first.source_kind == "jira"
    assert first.title == "Issue 1"
    assert first.source_uri == "https://m.atlassian.net/browse/PLAT-1"
    assert "Body" in first.text
    assert "A comment" in first.text
    assert first.updated_at is not None


def _index_two_page_handler():
    import json

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/api/3/search/jql"
        body = json.loads(request.content)
        assert body["fields"] == ["updated"]  # cheap scan: no bodies
        if body.get("nextPageToken") is None:
            return httpx.Response(200, json={
                "issues": [{"key": "PLAT-1", "fields": {"updated": "2026-06-01T10:00:00.000+0000"}}],
                "nextPageToken": "p2"})
        return httpx.Response(200, json={
            "issues": [{"key": "PLAT-2", "fields": {"updated": "2026-06-05T09:00:00.000+0000"}}],
            "isLast": True})

    return handler


def test_fetch_issue_index_maps_keys_to_updated():
    client = JiraReadClient(
        "https://m.atlassian.net/", "a@m.com", "tok", page_size=1,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(_index_two_page_handler())),
    )
    idx = asyncio.run(client.fetch_issue_index("PLAT"))
    assert set(idx) == {"PLAT-1", "PLAT-2"}
    assert idx["PLAT-2"] > idx["PLAT-1"]


def test_fetch_issues_appends_updated_since_clause():
    from datetime import datetime, timezone
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json
        seen["jql"] = json.loads(request.content)["jql"]
        return httpx.Response(200, json={"issues": [], "isLast": True})

    client = JiraReadClient(
        "https://m.atlassian.net/", "a@m.com", "tok",
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    asyncio.run(client.fetch_issues("PLAT", updated_since=datetime(2026, 6, 1, 10, 30, tzinfo=timezone.utc)))
    assert 'updated >= "2026/06/01 10:30"' in seen["jql"]
