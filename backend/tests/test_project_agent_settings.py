"""GET/PUT /projects/{id}/settings/agent — per-project agent behavior (ScrumAgent-7qy).

Covers: defaults when no row exists, member-only access, upsert round-trip,
validation of enum/range fields, and per-project isolation.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.main import app
from app.models import Project, ProjectMember, User
from app.models.types import ProjectRole
from app.security import create_access_token

SECRET = "router-test-secret"

DEFAULTS = {
    "auto_join_meetings": True,
    "record_audio": True,
    "capture_screenshots": False,
    "confidence_threshold": 70,
    "auto_apply_high_confidence": True,
    "response_style": "balanced",
    "context_window_meetings": 10,
}

PAYLOAD = {
    "auto_join_meetings": False,
    "record_audio": False,
    "capture_screenshots": True,
    "confidence_threshold": 42,
    "auto_apply_high_confidence": False,
    "response_style": "concise",
    "context_window_meetings": 30,
}


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        secret_key=SECRET,
        openai_api_key="k",
        google_client_id="cid",
        google_client_secret="csec",
        backend_base_url="http://testserver",
        frontend_base_url="http://localhost:3000",
        allowed_domain="municorn.com",
    )


@pytest.fixture
def client(db_session):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


def _auth(uid: int) -> dict:
    token = create_access_token(str(uid), SECRET, extra={"env": "production"})
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, email="alice@municorn.com", sub="sub-alice") -> User:
    user = User(google_sub=sub, email=email, name="Alice")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_project(db, owner: User, name="Telecom") -> Project:
    project = Project(
        owner_id=owner.id,
        name=name,
        agent_email="agent@municorn.com",
        google_connected=True,
    )
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def test_get_requires_auth(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    assert client.get(f"/projects/{project.id}/settings/agent").status_code == 401


def test_get_404_for_non_member(client, db_session):
    owner = _make_user(db_session)
    project = _make_project(db_session, owner)
    outsider = _make_user(db_session, email="bob@municorn.com", sub="sub-bob")
    resp = client.get(
        f"/projects/{project.id}/settings/agent", headers=_auth(outsider.id)
    )
    assert resp.status_code == 404


def test_get_returns_defaults_when_unset(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.get(f"/projects/{project.id}/settings/agent", headers=_auth(user.id))
    assert resp.status_code == 200
    assert resp.json() == DEFAULTS


def test_put_404_for_non_member(client, db_session):
    owner = _make_user(db_session)
    project = _make_project(db_session, owner)
    outsider = _make_user(db_session, email="bob@municorn.com", sub="sub-bob")
    resp = client.put(
        f"/projects/{project.id}/settings/agent",
        headers=_auth(outsider.id),
        json=PAYLOAD,
    )
    assert resp.status_code == 404


def test_put_then_get_round_trips(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.put(
        f"/projects/{project.id}/settings/agent", headers=_auth(user.id), json=PAYLOAD
    )
    assert resp.status_code == 200
    assert resp.json() == PAYLOAD

    resp = client.get(f"/projects/{project.id}/settings/agent", headers=_auth(user.id))
    assert resp.json() == PAYLOAD


def test_put_is_an_upsert(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    client.put(
        f"/projects/{project.id}/settings/agent", headers=_auth(user.id), json=PAYLOAD
    )
    second = dict(PAYLOAD, confidence_threshold=88, response_style="detailed")
    resp = client.put(
        f"/projects/{project.id}/settings/agent", headers=_auth(user.id), json=second
    )
    assert resp.status_code == 200
    assert resp.json() == second


def test_settings_are_per_project(client, db_session):
    user = _make_user(db_session)
    project_a = _make_project(db_session, user, name="A")
    project_b = _make_project(db_session, user, name="B")
    client.put(
        f"/projects/{project_a.id}/settings/agent",
        headers=_auth(user.id),
        json=PAYLOAD,
    )
    resp = client.get(
        f"/projects/{project_b.id}/settings/agent", headers=_auth(user.id)
    )
    assert resp.json() == DEFAULTS


@pytest.mark.parametrize(
    "field,value",
    [
        ("confidence_threshold", -1),
        ("confidence_threshold", 101),
        ("response_style", "sarcastic"),
        ("context_window_meetings", 0),
        ("context_window_meetings", 999),
    ],
)
def test_put_validates_fields(client, db_session, field, value):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.put(
        f"/projects/{project.id}/settings/agent",
        headers=_auth(user.id),
        json=dict(PAYLOAD, **{field: value}),
    )
    assert resp.status_code == 422
