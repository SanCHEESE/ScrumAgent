from __future__ import annotations

from app.config import Settings
from app.rag import LightRagBackend, build_rag_client


def _settings(**over) -> Settings:
    base = dict(_env_file=None, secret_key="x", openai_api_key="k",
                google_client_id="c", google_client_secret="s")
    base.update(over)
    return Settings(**base)


def test_factory_returns_lightrag_by_default():
    assert isinstance(build_rag_client(_settings()), LightRagBackend)


def test_factory_returns_lightrag_explicit():
    assert isinstance(build_rag_client(_settings(rag_provider="lightrag")), LightRagBackend)
