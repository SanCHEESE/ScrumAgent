from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, make_engine, make_session_factory


def test_engine_and_session_roundtrip():
    engine = make_engine("sqlite://")  # in-memory
    factory = make_session_factory(engine)
    with factory() as session:
        assert isinstance(session, Session)
        assert session.execute(text("select 1")).scalar() == 1


def test_base_has_metadata():
    assert hasattr(Base, "metadata")


from sqlalchemy import text

from app.database import init_db, make_engine, make_session_factory


def test_sqlite_foreign_keys_enabled():
    engine = make_engine("sqlite://")
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_in_memory_uses_shared_connection():
    engine = make_engine("sqlite://")
    factory = make_session_factory(engine)
    with factory() as s:
        s.execute(text("CREATE TABLE t (x int)"))
        s.execute(text("INSERT INTO t VALUES (1)"))
        s.commit()
    with factory() as s:
        assert s.execute(text("SELECT x FROM t")).scalar() == 1
