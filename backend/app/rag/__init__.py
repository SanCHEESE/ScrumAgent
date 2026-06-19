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
from app.rag.lightrag import LightRagBackend

# Backward-compatibility alias — app code not yet migrated to LightRagBackend
# continues to import RagClient; later tasks update each construction site.
RagClient = LightRagBackend

__all__ = [
    "Citation",
    "IndexResult",
    "LightRagBackend",
    "RagBackend",
    "RagClient",
    "RagDocument",
    "RagError",
    "RagMedia",
    "RagStatus",
    "RetrievedPassage",
]
