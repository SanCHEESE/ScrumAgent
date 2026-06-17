"""Read-only Notion client: walk a page + descendant pages, flatten blocks to text.

Read-only ahead of the planned Notion MCP client (ScrumAgent-ilz).
"""
from __future__ import annotations

from collections.abc import Callable

import httpx

from app.integrations import NOTION_VERSION
from app.sources import SourceDocument, parse_iso_dt

_API = "https://api.notion.com/v1"
_TEXT_BLOCKS = {
    "paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item",
    "numbered_list_item", "to_do", "quote", "callout", "code", "toggle",
}


def _rich_text(block_body: dict | None) -> str:
    spans = (block_body or {}).get("rich_text", []) or []
    return "".join(span.get("plain_text", "") for span in spans)


def _page_url(page_id: str) -> str:
    return f"https://www.notion.so/{page_id.replace('-', '')}"


class NotionReadClient:
    def __init__(
        self,
        token: str,
        *,
        max_depth: int = 5,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self._token = token
        self._max_depth = max_depth
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=30.0)
        )

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._token}", "Notion-Version": NOTION_VERSION}

    async def fetch_pages(self, root_page_id: str) -> list[SourceDocument]:
        out: list[SourceDocument] = []
        async with self._client_factory() as client:
            await self._walk_page(client, root_page_id, None, 0, out)
        return out

    async def _walk_page(self, client, page_id, known_title, depth, out) -> None:
        title = known_title
        updated = None
        if title is None:
            page = await self._get_page(client, page_id)
            title = self._page_title(page) if page else page_id
            updated = parse_iso_dt((page or {}).get("last_edited_time"))
        text, child_pages = await self._collect(client, page_id)
        out.append(SourceDocument(
            source_kind="notion",
            source_id=page_id,
            title=title,
            text=text,
            source_uri=_page_url(page_id),
            updated_at=updated,
        ))
        if depth < self._max_depth:
            for child_id, child_title in child_pages:
                await self._walk_page(client, child_id, child_title, depth + 1, out)

    async def _get_page(self, client, page_id) -> dict | None:
        resp = await client.get(f"{_API}/pages/{page_id}", headers=self._headers())
        if resp.status_code != 200:
            return None
        return resp.json()

    def _page_title(self, page: dict | None) -> str:
        props = (page or {}).get("properties", {}) or {}
        for prop in props.values():
            if prop.get("type") == "title":
                joined = "".join(s.get("plain_text", "") for s in prop.get("title", []))
                return joined or (page or {}).get("id", "")
        return (page or {}).get("id", "")

    async def _collect(self, client, block_id) -> tuple[str, list[tuple[str, str]]]:
        lines: list[str] = []
        child_pages: list[tuple[str, str]] = []
        cursor: str | None = None
        while True:
            params: dict = {"page_size": 100}
            if cursor:
                params["start_cursor"] = cursor
            resp = await client.get(
                f"{_API}/blocks/{block_id}/children", headers=self._headers(), params=params
            )
            resp.raise_for_status()
            body = resp.json()
            for block in body.get("results", []) or []:
                btype = block.get("type")
                block_id = block.get("id")
                if btype == "child_page":
                    if block_id:
                        child_pages.append(
                            (block_id, block.get("child_page", {}).get("title", ""))
                        )
                    continue
                if btype in _TEXT_BLOCKS:
                    text = _rich_text(block.get(btype))
                    if text:
                        lines.append(text)
                if (
                    block_id
                    and block.get("has_children")
                    and btype not in {"child_page", "child_database"}
                ):
                    sub_text, sub_children = await self._collect(client, block_id)
                    if sub_text:
                        lines.append(sub_text)
                    child_pages.extend(sub_children)
            if not body.get("has_more"):
                break
            cursor = body.get("next_cursor")
        return "\n".join(lines), child_pages
