"""SQLAlchemy engine + session plumbing.

Helpers are decoupled from `Settings` so they can be exercised against an
in-memory SQLite in tests. The app builds the real engine from
`settings.database_url` in `deps.py`. Models (ScrumAgent-67j) attach to `Base`.
"""
from __future__ import annotations

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Declarative base all ORM models inherit from."""


def make_engine(database_url: str) -> Engine:
    connect_args = (
        {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    )
    return create_engine(database_url, connect_args=connect_args, future=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
