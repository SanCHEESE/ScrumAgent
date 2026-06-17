"""Normalized read-only source artifact shared by integration readers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class SourceDocument:
    source_kind: str        # "jira" | "notion"
    source_id: str          # "PROJ-123" | "<notion_page_id>"
    title: str
    text: str               # flattened plain text
    source_uri: str         # deep link back to the issue/page
    updated_at: datetime | None = None


def parse_iso_dt(value: str | None) -> datetime | None:
    """Best-effort ISO-8601 parse (accepts trailing 'Z'); None on failure."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
