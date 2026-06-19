import pytest
from sqlalchemy.orm import Session

from app.deps import _session_factory, get_db, get_settings

REQUIRED = {
    "SECRET_KEY": "s",
    "OPENAI_API_KEY": "k",
    "GOOGLE_CLIENT_ID": "cid",
    "GOOGLE_CLIENT_SECRET": "sec",
}


def _set_required(monkeypatch):
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)


def test_get_settings_is_cached(monkeypatch):
    _set_required(monkeypatch)
    get_settings.cache_clear()
    assert get_settings() is get_settings()


def test_get_db_yields_session_then_closes(monkeypatch):
    _set_required(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    _session_factory.cache_clear()

    gen = get_db()
    db = next(gen)
    assert isinstance(db, Session)
    with pytest.raises(StopIteration):
        next(gen)  # generator cleanup closes the session


def test_get_rag_client_builds():
    from app.config import Settings
    from app import deps
    from app.rag import LightRagBackend

    s = Settings(_env_file=None, secret_key="x", openai_api_key="k",
                 google_client_id="c", google_client_secret="s")
    assert isinstance(deps.get_rag_client(s), LightRagBackend)
