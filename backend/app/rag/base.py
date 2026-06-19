"""Shared RAG types and the backend protocol.

App code depends only on these app-owned shapes; each adapter (LightRAG, Vertex)
translates its backend's wire format into them. `RagError` is the single error
type both adapters raise."""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

_PAGE_SIZE = 200
_DELETE_BATCH = 100
# DELETE /documents/delete_document returns 200 with one of these status values.
_DELETE_ACCEPTED = {None, "deletion_started"}
_DELETE_BUSY = "busy"


class RagError(RuntimeError):
    """RAG adapter failure (transport error or non-2xx/SDK error)."""


@dataclass(frozen=True)
class RagMedia:
    """One non-text artifact attached to a document (image, PDF, Office doc)."""
    mime_type: str                 # "image/png", "application/pdf", ...
    data: bytes | None = None      # inline bytes (written to a temp file to upload)
    uri: str | None = None         # OR a gs://, drive, or http(s) URI
    filename: str | None = None    # optional original name (extension hint)


@dataclass
class RagDocument:
    source_kind: str
    source_id: str
    title: str
    source_uri: str
    text: str | None = None
    media: list[RagMedia] = field(default_factory=list)


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


@runtime_checkable
class RagBackend(Protocol):
    """The contract every RAG adapter implements. Project scoping is a parameter
    on every method; isolation is each adapter's concern (LightRAG: file_source
    prefix; Vertex: one corpus per project)."""

    async def index_documents(
        self, project_id: str, documents: Sequence[RagDocument]
    ) -> "IndexResult": ...
    async def clear_project(self, project_id: str) -> int: ...
    async def clear_source(
        self, project_id: str, source_kind: str, source_id: str
    ) -> int: ...
    async def status(self, project_id: str) -> "RagStatus": ...
    async def retrieve(
        self, project_id: str, question: str, *, k: int = 6
    ) -> list["RetrievedPassage"]: ...
    async def pipeline_busy(self) -> bool: ...
    async def failed_count(self) -> int: ...
    async def reprocess_failed(self) -> None: ...


def _parse_citation(file_path: str) -> Citation | None:
    """`file_path` is "{project_id}::{kind}::{id}"; None if it has no usable kind/id."""
    parts = file_path.split("::")
    if len(parts) < 3 or not parts[1] or not parts[2]:
        return None
    return Citation(source_kind=parts[1], source_id=parts[2])


def _file_source(project_id: str, doc: RagDocument) -> str:
    return f"{project_id}::{doc.source_kind}::{doc.source_id}"
