import pytest
from pydantic import ValidationError

from app.config import Settings

REQUIRED = {
    "SECRET_KEY": "s",
    "OPENAI_API_KEY": "k",
    "GOOGLE_CLIENT_ID": "cid",
    "GOOGLE_CLIENT_SECRET": "sec",
}


@pytest.fixture(autouse=True)
def _hermetic_env(monkeypatch):
    """Clear every Settings-backed env var so tests don't depend on ambient
    environment. In Docker, compose injects the real .env as env vars — without
    this, default/None assertions silently read production values."""
    for field in Settings.model_fields:
        monkeypatch.delenv(field.upper(), raising=False)


def _set_required(monkeypatch):
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)


def test_missing_required_fails_fast():
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_defaults_applied_when_required_present(monkeypatch):
    _set_required(monkeypatch)
    settings = Settings(_env_file=None)
    assert settings.openai_model == "gpt-5.4-mini"
    assert settings.allowed_domain == "municorn.com"
    assert settings.rag_provider == "lightrag"
    assert settings.lightrag_base_url == "http://lightrag:9621"
    assert settings.lightrag_workspace == "scrumagent"
    assert settings.lightrag_timeout_seconds == 10.0


def test_optional_integrations_default_to_none(monkeypatch):
    _set_required(monkeypatch)
    settings = Settings(_env_file=None)
    assert settings.rovo_api_token is None
    assert settings.notion_token is None
    assert settings.lightrag_api_key is None
