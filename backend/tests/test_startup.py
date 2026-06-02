from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

from app import deps
from app.main import app

REQUIRED = {
    "SECRET_KEY": "startup-secret",
    "OPENAI_API_KEY": "k",
    "GOOGLE_CLIENT_ID": "cid",
    "GOOGLE_CLIENT_SECRET": "sec",
}


def test_lifespan_creates_schema(monkeypatch, tmp_path):
    db_file = tmp_path / "startup.db"
    for k, v in REQUIRED.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")
    deps.get_settings.cache_clear()

    # entering the context manager runs the lifespan (startup → init_db)
    with TestClient(app):
        pass

    engine = create_engine(f"sqlite:///{db_file}")
    assert "users" in set(inspect(engine).get_table_names())
    assert Path(db_file).exists()
