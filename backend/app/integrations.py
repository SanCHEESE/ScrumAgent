"""Live credential checks for per-project integrations (ScrumAgent-lb9.3).

``IntegrationValidators`` makes the actual network calls to Jira (Atlassian) and
Notion to confirm a pasted token works. The ``client_factory`` seam lets tests
swap an ``httpx.MockTransport`` so the logic is covered without a real request.
``parse_notion_page_id`` turns a pasted Notion section link into the page id the
agent will write to.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

import httpx

NOTION_VERSION = "2022-06-28"
_TIMEOUT = 10.0

# A Notion page/database id is 32 hex chars (sometimes dashed) at the end of the
# link path. Strip the query first so a ``?v=<view-id>` doesn't get matched.
_NOTION_ID_RE = re.compile(r"[0-9a-fA-F]{32}")


@dataclass
class ValidationResult:
    ok: bool
    detail: dict | None = None
    error: str | None = None


def parse_notion_page_id(url: str | None) -> str | None:
    if not url:
        return None
    core = url.split("?")[0].split("#")[0].rstrip("/")
    segment = core.rsplit("/", 1)[-1]  # last path segment carries the id
    candidate = segment.replace("-", "")[-32:]  # trailing 32 hex (compact or UUID)
    return candidate.lower() if _NOTION_ID_RE.fullmatch(candidate) else None


class IntegrationValidators:
    def __init__(
        self, client_factory: Callable[[], httpx.AsyncClient] | None = None
    ) -> None:
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=_TIMEOUT)
        )

    async def validate_jira(
        self, *, site_url: str, user_email: str, api_token: str
    ) -> ValidationResult:
        url = f"{site_url.rstrip('/')}/rest/api/3/myself"
        try:
            async with self._client_factory() as client:
                resp = await client.get(
                    url,
                    auth=(user_email, api_token),
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            return ValidationResult(ok=False, error=f"request failed: {exc}")
        if resp.status_code == 200:
            data = resp.json()
            return ValidationResult(
                ok=True,
                detail={
                    "accountId": data.get("accountId"),
                    "email": data.get("emailAddress"),
                    "name": data.get("displayName"),
                },
            )
        return ValidationResult(ok=False, error=f"HTTP {resp.status_code}")

    async def validate_notion(self, *, token: str) -> ValidationResult:
        try:
            async with self._client_factory() as client:
                resp = await client.get(
                    "https://api.notion.com/v1/users/me",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Notion-Version": NOTION_VERSION,
                    },
                )
        except httpx.HTTPError as exc:
            return ValidationResult(ok=False, error=f"request failed: {exc}")
        if resp.status_code == 200:
            data = resp.json()
            return ValidationResult(
                ok=True, detail={"id": data.get("id"), "name": data.get("name")}
            )
        return ValidationResult(ok=False, error=f"HTTP {resp.status_code}")
