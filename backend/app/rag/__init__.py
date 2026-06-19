"""RAG package: app-owned types + adapters behind the RagBackend protocol."""
from app.rag.base import (
    Citation,
    IndexResult,
    RagBackend,
    RagDocument,
    RagError,
    RagMedia,
    RagStatus,
    RetrievedPassage,
)
from app.rag.factory import build_rag_client
from app.rag.lightrag import LightRagBackend

__all__ = [
    "Citation",
    "IndexResult",
    "LightRagBackend",
    "RagBackend",
    "RagDocument",
    "RagError",
    "RagMedia",
    "RagStatus",
    "RetrievedPassage",
    "build_rag_client",
]
