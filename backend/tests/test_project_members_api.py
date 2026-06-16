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
