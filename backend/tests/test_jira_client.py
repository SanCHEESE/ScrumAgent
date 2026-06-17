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
