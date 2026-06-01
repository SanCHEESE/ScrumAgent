"""SQLAlchemy engine + session plumbing.

Engine selection is driven entirely by ``database_url`` so callers never branch
on dialect: ``sqlite://`` (tests), a file URL (local), or ``postgresql+psycopg``
(Cloud SQL in prod). Models attach to ``Base`` and are created via ``init_db``.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

_IN_MEMORY = {"sqlite://", "sqlite:///:memory:"}


class Base(DeclarativeBase):
    """Declarative base all ORM models inherit from."""


def make_engine(database_url: str) -> Engine:
    if database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        if database_url in _IN_MEMORY:
            # one shared connection so create_all + rows survive across sessions
            return create_engine(
                database_url,
                connect_args=connect_args,
                poolclass=StaticPool,
                future=True,
            )
        return create_engine(database_url, connect_args=connect_args, future=True)
    # Postgres / Cloud SQL: recycle dead connections the proxy drops while idle
    return create_engine(database_url, pool_pre_ping=True, future=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_conn, _connection_record) -> None:
    # SQLite ignores FK constraints unless this pragma is set per connection.
    if isinstance(dbapi_conn, sqlite3.Connection):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def init_db(engine: Engine) -> None:
    """Create all tables. MVP bootstrap — no Alembic (see ScrumAgent follow-up)."""
    from app import models  # noqa: F401  (registers every model on Base.metadata)

    if engine.url.get_backend_name() == "sqlite" and engine.url.database not in (
        None,
        ":memory:",
    ):
        Path(engine.url.database).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
