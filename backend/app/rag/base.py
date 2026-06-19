"""Shared RAG types and the backend protocol.

App code depends only on these app-owned shapes; each adapter (LightRAG, Vertex)
translates its backend's wire format into them. `RagError` is the single error
type both adapters raise."""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

_PAGE_SIZE = 200
_DELETE_BATCH = 100
# DELETE /documents/delete_document returns 200 with one of these status values.
_DELETE_ACCEPTED = {None, "deletion_started"}
_DELETE_BUSY = "busy"


class RagError(RuntimeError):
    """RAG adapter failure (transport error or non-2xx/SDK error)."""


@dataclass
class RagDocument:
    text: str
    source_kind: str
    source_id: str
    title: str
    source_uri: str


@dataclass
class IndexResult:
    submitted: int
    track_id: str | None = None
    failed: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class RagStatus:
    total: int
    by_status: dict[str, int]
    by_source_kind: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class Citation:
    source_kind: str
    source_id: str
    title: str | None = None
    source_uri: str | None = None


@dataclass
class RetrievedPassage:
    text: str
    score: float
    citation: Citation


def _parse_citation(file_path: str) -> Citation | None:
    """`file_path` is "{project_id}::{kind}::{id}"; None if it has no usable kind/id."""
    parts = file_path.split("::")
    if len(parts) < 3 or not parts[1] or not parts[2]:
        return None
    return Citation(source_kind=parts[1], source_id=parts[2])


def _file_source(project_id: str, doc: RagDocument) -> str:
    return f"{project_id}::{doc.source_kind}::{doc.source_id}"
