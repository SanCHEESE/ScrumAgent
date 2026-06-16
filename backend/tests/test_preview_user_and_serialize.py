"""Regression tests for two backend robustness bugs.

#8  ``deps._ensure_preview_user`` did a check-then-insert with no guard against a
    concurrent first request: two agent-preview requests could both see no row and
    both insert ``google_sub="dev-sub"``, and the loser's commit raised
    ``IntegrityError`` (and ``.one_or_none()`` would raise ``MultipleResultsFound``
    if duplicate rows ever existed). It must tolerate a concurrent insert and
    return the now-existing row.

#15 ``routers.projects._serialize`` dereferenced ``db.get(User, member.user_id)``
    without a None guard. An orphaned ``ProjectMember`` (user_id -> missing User)
    turned that into an ``AttributeError`` -> 500 on every project-serializing
    endpoint. It must skip the orphan instead of crashing.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app import deps
from app.config import Settings
from app.database import Base, init_db
from app.deps import (
    PREVIEW_EMAIL,
    PREVIEW_GOOGLE_SUB,
    PREVIEW_NAME,
    _ensure_preview_user,
)
from app.main import app
from app.models import Project, ProjectMember, User
from app.models.types import ProjectRole
from app.routers.projects import _serialize

SECRET = "router-test-secret"


def _preview_settings() -> Settings:
    return Settings(
        _env_file=None,
        secret_key=SECRET,
        openai_api_key="k",
        google_client_id="cid",
        google_client_secret="csec",
        backend_base_url="http://testserver",
        frontend_base_url="http://localhost:3000",
        allowed_domain="municorn.com",
        app_environment="agent_preview",
    )


# --------------------------------------------------------------------------- #
# #8 — _ensure_preview_user
# --------------------------------------------------------------------------- #


def test_ensure_preview_user_returns_existing_without_duplicate(db_session: Session):
    """Common case: a preview row already exists -> return it, create no second row."""
    existing = User(
        google_sub=PREVIEW_GOOGLE_SUB, email=PREVIEW_EMAIL, name=PREVIEW_NAME
    )
    db_session.add(existing)
    db_session.commit()
    db_session.refresh(existing)

    got = _ensure_preview_user(db_session)

    assert got.id == existing.id
    assert got.google_sub == PREVIEW_GOOGLE_SUB
    assert (
        db_session.query(User)
        .filter(User.google_sub == PREVIEW_GOOGLE_SUB)
        .count()
        == 1
    )


def test_ensure_preview_user_creates_once_then_idempotent(db_session: Session):
    """First call creates the row; a second call returns the same row, no duplicate."""
    first = _ensure_preview_user(db_session)
    assert first.id is not None

    second = _ensure_preview_user(db_session)
    assert second.id == first.id
    assert (
        db_session.query(User)
        .filter(User.google_sub == PREVIEW_GOOGLE_SUB)
        .count()
        == 1
    )


def test_ensure_preview_user_recovers_from_concurrent_insert(tmp_path):
    """Race: a concurrent request inserts the preview row mid-call.

    Faithfully reproduces #8. The helper reads ``None`` at the top, then on a real
    DB another request commits ``google_sub="dev-sub"`` before our own INSERT lands.
    We force that exact interleave deterministically: a ``before_flush`` listener on
    our session commits a *racer* row through an independent connection right before
    our INSERT executes, so our INSERT hits the unique constraint. Uses a temp-file
    SQLite (not in-memory/StaticPool) so the racer truly gets its own connection and
    transaction. Before the fix our ``commit`` raises ``IntegrityError``; after the
    fix the helper rolls back, re-queries, and returns the racer's row.
    """
    from sqlalchemy import event

    db_url = f"sqlite:///{tmp_path / 'race.db'}"
    engine = create_engine(
        db_url, connect_args={"check_same_thread": False}, future=True
    )
    init_db(engine)
    factory = sessionmaker(bind=engine, autoflush=False, future=True)
    session_a = factory()

    state = {"fired": False}

    def _commit_racer(session, _flush_context, _instances):
        # Fires once, during A's INSERT flush, before the statement executes.
        if state["fired"]:
            return
        state["fired"] = True
        racer_session = factory()
        try:
            racer_session.add(
                User(
                    google_sub=PREVIEW_GOOGLE_SUB,
                    email=PREVIEW_EMAIL,
                    name=PREVIEW_NAME,
                )
            )
            racer_session.commit()
        finally:
            racer_session.close()

    event.listen(session_a, "before_flush", _commit_racer)
    try:
        got = _ensure_preview_user(session_a)
        assert got.google_sub == PREVIEW_GOOGLE_SUB
        assert state["fired"] is True  # the race actually happened

        with engine.connect() as conn:
            count = conn.execute(
                text("SELECT COUNT(*) FROM users WHERE google_sub = :s"),
                {"s": PREVIEW_GOOGLE_SUB},
            ).scalar_one()
        assert count == 1  # racer's row only; no duplicate
    finally:
        event.remove(session_a, "before_flush", _commit_racer)
        session_a.close()
        engine.dispose()


def test_get_current_user_preview_no_bearer_uses_preview_user(db_session: Session):
    """End-to-end: the agent-preview unauth path resolves to the preview user."""

    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _preview_settings
    app.dependency_overrides[deps.get_db] = _ov_db
    try:
        client = TestClient(app)  # no `with`: skip lifespan (real-DB) startup
        resp = client.get("/users/directory")  # any get_current_user route
        assert resp.status_code == 200
        rows = db_session.query(User).filter(
            User.google_sub == PREVIEW_GOOGLE_SUB
        ).all()
        assert len(rows) == 1
        assert rows[0].email == PREVIEW_EMAIL
    finally:
        app.dependency_overrides.clear()


# --------------------------------------------------------------------------- #
# #15 — _serialize tolerates an orphaned ProjectMember
# --------------------------------------------------------------------------- #


GHOST_USER_ID = 999_999  # never assigned to any real User row


def _orphan_project(db_session: Session) -> tuple[Project, User, int]:
    """A project with one live member and one orphan membership.

    The orphan ProjectMember points at ``GHOST_USER_ID``, a user_id that no User
    row ever has — exactly the drift (a membership referencing a missing user)
    that triggers #15. The test DB enforces FKs (PRAGMA foreign_keys=ON via the
    global engine listener), so we drop the pragma on this connection just long
    enough to insert the dangling membership. We deliberately do NOT delete a real
    user (SQLite would recycle its freed rowid for the next INSERT — e.g. the
    preview user — silently "healing" the orphan and masking the bug).
    """
    live = User(google_sub="sub-live", email="live@municorn.com", name="Live")
    db_session.add(live)
    db_session.commit()
    db_session.refresh(live)

    project = Project(
        owner_id=live.id,
        name="Orphan P",
        agent_email="agent@municorn.com",
        google_connected=True,
    )
    project.members.append(ProjectMember(user_id=live.id, role=ProjectRole.admin))
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    # Insert a membership whose user_id references no User row.
    db_session.execute(text("PRAGMA foreign_keys=OFF"))
    db_session.execute(
        text(
            "INSERT INTO project_members (project_id, user_id, role) "
            "VALUES (:p, :u, :r)"
        ),
        {"p": project.id, "u": GHOST_USER_ID, "r": ProjectRole.member.value},
    )
    db_session.commit()
    db_session.execute(text("PRAGMA foreign_keys=ON"))

    db_session.refresh(project)
    assert db_session.get(User, GHOST_USER_ID) is None  # orphan confirmed
    assert len(project.members) == 2  # live + orphan
    return project, live, GHOST_USER_ID


def test_serialize_skips_orphaned_member(db_session: Session):
    """_serialize must not raise on a membership whose user is gone; it omits it."""
    project, live, ghost_id = _orphan_project(db_session)

    out = _serialize(project, db_session)  # before fix: AttributeError on None.email

    member_user_ids = {m.user_id for m in out.members}
    assert live.id in member_user_ids
    assert ghost_id not in member_user_ids
    assert len(out.members) == 1
    assert out.members[0].email == "live@municorn.com"


def test_get_project_with_orphan_member_returns_200(db_session: Session):
    """The HTTP detail endpoint stays 200 (not 500) with an orphaned member."""
    project, live, _ghost_id = _orphan_project(db_session)

    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _preview_settings  # see-all access
    app.dependency_overrides[deps.get_db] = _ov_db
    try:
        client = TestClient(app)  # no `with`: skip lifespan (real-DB) startup
        resp = client.get(f"/projects/{project.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert [m["email"] for m in body["members"]] == ["live@municorn.com"]
    finally:
        app.dependency_overrides.clear()


def test_list_projects_preview_tolerates_orphan_member(db_session: Session):
    """agent-preview list (see-all) must not 500 when any project has an orphan."""
    project, live, _ghost_id = _orphan_project(db_session)

    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _preview_settings
    app.dependency_overrides[deps.get_db] = _ov_db
    try:
        client = TestClient(app)  # no `with`: skip lifespan (real-DB) startup
        resp = client.get("/projects")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert [m["email"] for m in body[0]["members"]] == ["live@municorn.com"]
    finally:
        app.dependency_overrides.clear()
