from __future__ import annotations

import asyncio

import httpx

from app.notion_client import NotionReadClient

ROOT = "root000000000000000000000000aaaa"
CHILD = "child0000-0000-0000-0000-0000000bbbb"


def _handler():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == f"/v1/pages/{ROOT}":
            return httpx.Response(200, json={
                "id": ROOT,
                "last_edited_time": "2026-06-10T12:00:00.000Z",
                "properties": {"Name": {"type": "title", "title": [{"plain_text": "Root Page"}]}},
            })
        if path == f"/v1/blocks/{ROOT}/children":
            return httpx.Response(200, json={"has_more": False, "next_cursor": None, "results": [
                {"type": "paragraph", "has_children": False,
                 "paragraph": {"rich_text": [{"plain_text": "Root body text"}]}},
                {"id": CHILD, "type": "child_page", "has_children": True,
                 "child_page": {"title": "Child Page"}},
            ]})
        if path == f"/v1/pages/{CHILD}":
            return httpx.Response(200, json={
                "id": CHILD,
                "last_edited_time": "2026-06-11T08:30:00.000Z",
                "properties": {"Name": {"type": "title", "title": [{"plain_text": "Child Page"}]}},
            })
        if path == f"/v1/blocks/{CHILD}/children":
            return httpx.Response(200, json={"has_more": False, "next_cursor": None, "results": [
                {"type": "heading_1", "has_children": False,
                 "heading_1": {"rich_text": [{"plain_text": "Child heading"}]}},
            ]})
        raise AssertionError(f"unexpected path {path}")

    return handler


def _client(max_depth=5) -> NotionReadClient:
    return NotionReadClient(
        "ntn-secret",
        max_depth=max_depth,
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(_handler())),
    )


def test_fetch_pages_walks_root_and_child():
    docs = asyncio.run(_client().fetch_pages(ROOT))
    by_id = {d.source_id: d for d in docs}
    assert set(by_id) == {ROOT, CHILD}
    assert by_id[ROOT].title == "Root Page"
    assert "Root body text" in by_id[ROOT].text
    assert by_id[ROOT].source_kind == "notion"
    assert by_id[ROOT].source_uri == f"https://www.notion.so/{ROOT}"
    assert by_id[CHILD].title == "Child Page"
    assert "Child heading" in by_id[CHILD].text


def test_depth_cap_stops_recursion():
    docs = asyncio.run(_client(max_depth=0).fetch_pages(ROOT))
    assert [d.source_id for d in docs] == [ROOT]  # child not visited at depth 0


def test_every_page_has_last_edited_time():
    docs = asyncio.run(_client().fetch_pages(ROOT))
    by_id = {d.source_id: d for d in docs}
    assert by_id[ROOT].updated_at is not None
    assert by_id[CHILD].updated_at is not None      # child timestamp now fetched too
    assert by_id[CHILD].updated_at > by_id[ROOT].updated_at
