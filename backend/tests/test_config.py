import pytest
from pydantic import ValidationError

from app.config import Settings

REQUIRED = {
    "SECRET_KEY": "s",
    "OPENAI_API_KEY": "k",
    "GOOGLE_CLIENT_ID": "cid",
    "GOOGLE_CLIENT_SECRET": "sec",
}


def _set_required(monkeypatch):
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)


def _clear_required(monkeypatch):
    for key in REQUIRED:
        monkeypatch.delenv(key, raising=False)


def test_missing_required_fails_fast(monkeypatch):
    _clear_required(monkeypatch)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_defaults_applied_when_required_present(monkeypatch):
    _set_required(monkeypatch)
    settings = Settings(_env_file=None)
    assert settings.openai_model == "gpt-5.4-mini"
    assert settings.allowed_domain == "municorn.com"


def test_optional_integrations_default_to_none(monkeypatch):
    _set_required(monkeypatch)
    settings = Settings(_env_file=None)
    assert settings.rovo_api_token is None
    assert settings.notion_token is None
