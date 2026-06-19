"""Provider selection: build the RagBackend named by `settings.rag_provider`."""
from __future__ import annotations

from app.config import Settings
from app.rag.base import RagBackend


def build_rag_client(settings: Settings) -> RagBackend:
    if settings.rag_provider == "google":
        from app.rag.vertex import VertexRagBackend
        return VertexRagBackend.from_settings(settings)
    from app.rag.lightrag import LightRagBackend
    return LightRagBackend.from_settings(settings)
