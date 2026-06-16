"""Settings → Members backend endpoints (ScrumAgent-idt).

Covers ProjectOut.pending_members serialization, batch add (existing user →
member, unknown email → invitation), role PATCH for both kinds, and the live
member-suggestions endpoint. Faked GoogleCalendarClient — no network.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.google_calendar import GoogleCalendarError
from app.main import app
from app.models import (
    PendingProjectMember,
    Project,
    ProjectCredential,
    ProjectMember,
    User,
)
from app.models.types import ProjectRole
from app.security import create_access_token

SECRET = "router-test-secret"


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


class FakeCalendar:
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.error: Exception | None = None

    async def list_events(self, refresh_token, *, time_min, time_max, max_results=250):
        if self.error is not None:
            raise self.error
        return list(self.events)


@pytest.fixture
def fake_calendar() -> FakeCalendar:
    return FakeCalendar()


@pytest.fixture
def client(db_session, fake_calendar):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_google_calendar] = lambda: fake_calendar
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


def _auth(uid: int) -> dict:
    token = create_access_token(str(uid), SECRET, extra={"env": "production"})
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, email, sub) -> User:
    user = User(google_sub=sub, email=email, name=email.split("@")[0].title())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_project(db, owner, *, refresh_token="1//rt") -> Project:
    project = Project(
        owner_id=owner.id,
        name="Telecom",
        agent_email="agent@municorn.com",
        google_connected=True,
    )
    project.credential = ProjectCredential(google_refresh_token=refresh_token)
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


# --- Task 2: serialization ---

def test_project_out_includes_empty_pending_members(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.get(f"/projects/{project.id}", headers=_auth(owner.id))
    assert resp.status_code == 200
    assert resp.json()["pending_members"] == []


def test_project_out_serializes_pending_members(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="bob@municorn.com", role=ProjectRole.viewer
        )
    )
    db_session.commit()
    resp = client.get(f"/projects/{project.id}", headers=_auth(owner.id))
    assert resp.status_code == 200
    assert resp.json()["pending_members"] == [
        {"email": "bob@municorn.com", "role": "viewer"}
    ]


# --- Task 3: POST /{id}/members batch add ---

def test_add_members_requires_auth(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.post(
        f"/projects/{project.id}/members",
        json={"members": [{"email": "x@municorn.com", "role": "member"}]},
    )
    assert resp.status_code == 401


def test_add_members_404_for_non_member(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    outsider = _make_user(db_session, "bob@municorn.com", "sub-b")
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(outsider.id),
        json={"members": [{"email": "x@municorn.com", "role": "member"}]},
    )
    assert resp.status_code == 404


def test_add_existing_user_becomes_member(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    bob = _make_user(db_session, "bob@municorn.com", "sub-b")
    project = _make_project(db_session, owner)
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "BOB@municorn.com", "role": "viewer"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    bob_rows = [m for m in body["members"] if m["user_id"] == bob.id]
    assert bob_rows == [
        {"user_id": bob.id, "email": "bob@municorn.com", "name": "Bob", "role": "viewer"}
    ]
    assert body["pending_members"] == []


def test_add_unknown_email_becomes_pending(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "Carol@municorn.com", "role": "member"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["pending_members"] == [
        {"email": "carol@municorn.com", "role": "member"}
    ]
    # No new registered member beyond the owner.
    assert {m["email"] for m in body["members"]} == {"alice@municorn.com"}


def test_add_members_is_idempotent_for_existing_member(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    bob = _make_user(db_session, "bob@municorn.com", "sub-b")
    project = _make_project(db_session, owner)
    payload = {"members": [{"email": "bob@municorn.com", "role": "admin"}]}
    client.post(f"/projects/{project.id}/members", headers=_auth(owner.id), json=payload)
    # Re-add with a different role: existing membership is left untouched.
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "bob@municorn.com", "role": "viewer"}]},
    )
    assert resp.status_code == 200
    bob_rows = [m for m in resp.json()["members"] if m["user_id"] == bob.id]
    assert len(bob_rows) == 1
    assert bob_rows[0]["role"] == "admin"  # unchanged by the second add


def test_add_existing_invite_updates_its_role(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "carol@municorn.com", "role": "member"}]},
    )
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "carol@municorn.com", "role": "admin"}]},
    )
    assert resp.json()["pending_members"] == [
        {"email": "carol@municorn.com", "role": "admin"}
    ]


# --- Task 4: PATCH role (member & pending) ---

def test_patch_member_role(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    bob = _make_user(db_session, "bob@municorn.com", "sub-b")
    project = _make_project(db_session, owner)
    db_session.add(
        ProjectMember(project_id=project.id, user_id=bob.id, role=ProjectRole.member)
    )
    db_session.commit()
    resp = client.patch(
        f"/projects/{project.id}/members/{bob.id}",
        headers=_auth(owner.id),
        json={"role": "admin"},
    )
    assert resp.status_code == 200
    bob_rows = [m for m in resp.json()["members"] if m["user_id"] == bob.id]
    assert bob_rows[0]["role"] == "admin"


def test_patch_member_role_404_when_not_a_member(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.patch(
        f"/projects/{project.id}/members/999999",
        headers=_auth(owner.id),
        json={"role": "admin"},
    )
    assert resp.status_code == 404


def test_patch_pending_member_role(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="carol@municorn.com", role=ProjectRole.member
        )
    )
    db_session.commit()
    resp = client.patch(
        f"/projects/{project.id}/pending-members/carol@municorn.com",
        headers=_auth(owner.id),
        json={"role": "viewer"},
    )
    assert resp.status_code == 200
    assert resp.json()["pending_members"] == [
        {"email": "carol@municorn.com", "role": "viewer"}
    ]


def test_patch_pending_member_role_404_when_no_invite(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.patch(
        f"/projects/{project.id}/pending-members/nobody@municorn.com",
        headers=_auth(owner.id),
        json={"role": "viewer"},
    )
    assert resp.status_code == 404
