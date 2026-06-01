"""Shared FastAPI dependencies.

`get_settings` and `get_db` are the two injection points the routers and agents
build on. Both are cached so the engine/session factory is created once per
process. Override them in tests via `app.dependency_overrides`.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Iterator

from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.database import make_engine, make_session_factory


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    engine = make_engine(get_settings().database_url)
    return make_session_factory(engine)


def get_db() -> Iterator[Session]:
    db = _session_factory()()
    try:
        yield db
    finally:
        db.close()
