from __future__ import annotations

from app.rag import LightRagBackend, RagBackend, RagDocument, RagMedia


def test_ragdocument_text_optional_and_media_defaults_empty():
    doc = RagDocument(source_kind="jira", source_id="K-1", title="t", source_uri="u")
    assert doc.text is None
    assert doc.media == []


def test_ragdocument_carries_media():
    doc = RagDocument(
        source_kind="meeting", source_id="m-1", title="Standup", source_uri="u",
        text="notes", media=[RagMedia(mime_type="image/png", data=b"\x89PNG")],
    )
    assert doc.media[0].mime_type == "image/png"
    assert doc.media[0].data == b"\x89PNG"


def test_lightrag_backend_satisfies_protocol():
    backend = LightRagBackend("http://lightrag:9621")
    assert isinstance(backend, RagBackend)
