"""Read-only Jira client: fetch all issues for a project key, flatten ADF to text.

Read-only ahead of the planned Rovo client (ScrumAgent-qor).
"""
from __future__ import annotations

from collections.abc import Callable

import httpx

from app.sources import SourceDocument, parse_iso_dt

_BLOCK_TYPES = {"paragraph", "heading", "blockquote", "codeBlock", "listItem", "panel"}


def adf_to_text(node: object) -> str:
    """Flatten an Atlassian Document Format node to good-enough plain text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(adf_to_text(item) for item in node)
    if not isinstance(node, dict):
        return ""
    node_type = node.get("type")
    if node_type == "text":
        return node.get("text", "")
    if node_type == "hardBreak":
        return "\n"
    inner = adf_to_text(node.get("content"))
    if node_type in _BLOCK_TYPES:
        return inner + "\n"
    return inner


class JiraReadClient:
    FIELDS = ["summary", "description", "comment", "status", "issuetype", "updated"]

    def __init__(
        self,
        site_url: str,
        user_email: str,
        api_token: str,
        *,
        page_size: int = 100,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self._site = site_url.rstrip("/")
        self._auth = (user_email, api_token)
        self._page_size = page_size
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=30.0)
        )

    async def fetch_issues(self, project_key: str) -> list[SourceDocument]:
        # Jira Cloud removed GET /rest/api/3/search (410 Gone, May 2025). The
        # replacement is the enhanced search POST /rest/api/3/search/jql, which
        # pages by an opaque nextPageToken instead of startAt/total
        # (ScrumAgent-2vi).
        jql = f'project = "{project_key}" ORDER BY created ASC'
        out: list[SourceDocument] = []
        next_token: str | None = None
        async with self._client_factory() as client:
            while True:
                payload: dict = {
                    "jql": jql,
                    "maxResults": self._page_size,
                    "fields": self.FIELDS,
                }
                if next_token:
                    payload["nextPageToken"] = next_token
                resp = await client.post(
                    f"{self._site}/rest/api/3/search/jql",
                    auth=self._auth,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                body = resp.json()
                issues = body.get("issues", []) or []
                for issue in issues:
                    out.append(self._to_doc(issue))
                next_token = body.get("nextPageToken")
                if not next_token or not issues:
                    break
        return out

    def _to_doc(self, issue: dict) -> SourceDocument:
        key = issue.get("key", "")
        fields = issue.get("fields", {}) or {}
        summary = fields.get("summary") or key
        description = adf_to_text(fields.get("description")).strip()
        comments = (fields.get("comment", {}) or {}).get("comments", []) or []
        comment_text = "\n".join(
            adf_to_text(c.get("body")).strip() for c in comments
        ).strip()
        parts = [summary]
        if description:
            parts.append(description)
        if comment_text:
            parts.append("Comments:\n" + comment_text)
        return SourceDocument(
            source_kind="jira",
            source_id=key,
            title=summary,
            text="\n\n".join(parts),
            source_uri=f"{self._site}/browse/{key}",
            updated_at=parse_iso_dt(fields.get("updated")),
        )
