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
