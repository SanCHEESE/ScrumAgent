"""GET /projects/{id}/meetings — live agent-calendar listing (ScrumAgent-m5x).

Faked GoogleCalendarClient: no network. Covers membership enforcement, event
mapping (timed, all-day, Meet link, attendees), cancelled-event filtering, and
the revoked-grant / upstream-failure error paths.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.google_calendar import GoogleAuthRevokedError, GoogleCalendarError
from app.main import app
from app.models import Project, ProjectCredential, ProjectMember, User
from app.models.types import ProjectRole
from app.security import create_access_token

SECRET = "router-test-secret"

EVENT_TIMED = {
    "id": "evt-1",
    "status": "confirmed",
    "summary": "Sprint Planning",
    "htmlLink": "https://calendar.google.com/event?eid=evt-1",
    "hangoutLink": "https://meet.google.com/abc-defg-hij",
    "start": {"dateTime": "2026-06-15T10:00:00+02:00"},
    "end": {"dateTime": "2026-06-15T11:00:00+02:00"},
    "organizer": {"email": "agent@municorn.com"},
    "attendees": [
        {"email": "alice@municorn.com", "displayName": "Alice", "responseStatus": "accepted"},
        {"email": "agent@municorn.com", "organizer": True, "responseStatus": "accepted"},
    ],
}

EVENT_ALL_DAY = {
    "id": "evt-2",
    "status": "confirmed",
    "summary": "Team Offsite",
    "start": {"date": "2026-06-20"},
    "end": {"date": "2026-06-21"},
}

EVENT_CANCELLED = {
    "id": "evt-3",
    "status": "cancelled",
    "start": {"dateTime": "2026-06-16T10:00:00Z"},
    "end": {"dateTime": "2026-06-16T10:30:00Z"},
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


class FakeCalendar:
    def __init__(self) -> None:
        self.events: list[dict] = [EVENT_TIMED, EVENT_ALL_DAY, EVENT_CANCELLED]
        self.error: Exception | None = None
        self.last_refresh_token: str | None = None

    async def list_events(self, refresh_token, *, time_min, time_max, max_results=250):
        self.last_refresh_token = refresh_token
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
    return {"Authorization": f"Bearer {create_access_token(str(uid), SECRET)}"}


def _make_user(db, email="alice@municorn.com", sub="sub-alice") -> User:
    user = User(google_sub=sub, email=email, name="Alice")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_project(db, owner: User, *, refresh_token: str | None = "1//rt") -> Project:
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


def test_meetings_require_auth(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    assert client.get(f"/projects/{project.id}/meetings").status_code == 401


def test_meetings_404_for_non_member(client, db_session):
    owner = _make_user(db_session)
    project = _make_project(db_session, owner)
    outsider = _make_user(db_session, email="bob@municorn.com", sub="sub-bob")
    resp = client.get(f"/projects/{project.id}/meetings", headers=_auth(outsider.id))
    assert resp.status_code == 404


def test_meetings_maps_events_and_drops_cancelled(client, db_session, fake_calendar):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.get(f"/projects/{project.id}/meetings", headers=_auth(user.id))
    assert resp.status_code == 200
    meetings = resp.json()
    assert [m["id"] for m in meetings] == ["evt-1", "evt-2"]  # cancelled dropped
    # The decrypted project refresh token reached the calendar client.
    assert fake_calendar.last_refresh_token == "1//rt"

    timed = meetings[0]
    assert timed["title"] == "Sprint Planning"
    assert timed["start"] == "2026-06-15T10:00:00+02:00"
    assert timed["all_day"] is False
    assert timed["meet_link"] == "https://meet.google.com/abc-defg-hij"
    assert timed["html_link"].endswith("eid=evt-1")
    assert timed["organizer_email"] == "agent@municorn.com"
    assert timed["attendees"][0] == {
        "email": "alice@municorn.com",
        "display_name": "Alice",
        "response_status": "accepted",
        "organizer": False,
    }
    assert timed["attendees"][1]["organizer"] is True

    all_day = meetings[1]
    assert all_day["all_day"] is True
    assert all_day["start"] == "2026-06-20"
    assert all_day["meet_link"] is None


def test_meetings_409_when_no_google_credential(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user, refresh_token=None)
    resp = client.get(f"/projects/{project.id}/meetings", headers=_auth(user.id))
    assert resp.status_code == 409


def test_meetings_409_when_grant_revoked(client, db_session, fake_calendar):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    fake_calendar.error = GoogleAuthRevokedError("revoked")
    resp = client.get(f"/projects/{project.id}/meetings", headers=_auth(user.id))
    assert resp.status_code == 409
    assert "reconnect" in resp.json()["detail"]


def test_revoked_grant_marks_project_disconnected(client, db_session, fake_calendar):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    fake_calendar.error = GoogleAuthRevokedError("revoked")
    client.get(f"/projects/{project.id}/meetings", headers=_auth(user.id))
    db_session.refresh(project)
    assert project.google_connected is False
    # GET /projects now reports the broken grant so the UI can show Error.
    resp = client.get("/projects", headers=_auth(user.id))
    assert resp.json()[0]["google_connected"] is False


def test_upstream_failure_does_not_mark_project_disconnected(
    client, db_session, fake_calendar
):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    fake_calendar.error = GoogleCalendarError("boom")
    client.get(f"/projects/{project.id}/meetings", headers=_auth(user.id))
    db_session.refresh(project)
    assert project.google_connected is True


def test_meetings_502_on_upstream_failure(client, db_session, fake_calendar):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    fake_calendar.error = GoogleCalendarError("boom")
    resp = client.get(f"/projects/{project.id}/meetings", headers=_auth(user.id))
    assert resp.status_code == 502
