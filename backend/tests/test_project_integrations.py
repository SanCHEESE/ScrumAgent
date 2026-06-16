"""Per-project integrations settings surface (ScrumAgent-d9q).

GET /projects/{id}/integrations           — real status, never secrets
PUT /projects/{id}/integrations/jira      — validate live, then save
PUT /projects/{id}/integrations/notion    — validate live, then save
PUT /projects/{id}/integrations/google    — reconnect via a PendingOAuth grant
POST /projects/{id}/integrations/{p}/test — probe the *stored* credentials

Validators and the calendar client are faked — no network.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.google_calendar import GoogleAuthRevokedError, GoogleCalendarError
from app.integrations import ValidationResult
from app.main import app
from app.models import PendingOAuth, Project, ProjectCredential, ProjectMember, User
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


class RecordingValidators:
    """Fake validators that record the kwargs of every call."""

    def __init__(self) -> None:
        self.jira_result = ValidationResult(ok=True, detail={"name": "Agent"})
        self.notion_result = ValidationResult(ok=True, detail={"name": "Kabanchik"})
        self.jira_calls: list[dict] = []
        self.notion_calls: list[dict] = []

    async def validate_jira(self, **kw) -> ValidationResult:
        self.jira_calls.append(kw)
        return self.jira_result

    async def validate_notion(self, **kw) -> ValidationResult:
        self.notion_calls.append(kw)
        return self.notion_result


class FakeCalendar:
    def __init__(self) -> None:
        self.error: Exception | None = None
        self.last_refresh_token: str | None = None

    async def list_events(self, refresh_token, *, time_min, time_max, max_results=250):
        self.last_refresh_token = refresh_token
        if self.error is not None:
            raise self.error
        return []


@pytest.fixture
def validators() -> RecordingValidators:
    return RecordingValidators()


@pytest.fixture
def fake_calendar() -> FakeCalendar:
    return FakeCalendar()


@pytest.fixture
def client(db_session, validators, fake_calendar):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_integration_validators] = lambda: validators
    app.dependency_overrides[deps.get_google_calendar] = lambda: fake_calendar
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


def _make_project(
    db,
    owner: User,
    *,
    refresh_token: str | None = "1//rt",
    with_jira: bool = False,
    with_notion: bool = False,
) -> Project:
    project = Project(
        owner_id=owner.id,
        name="Telecom",
        agent_email="agent@municorn.com",
        google_connected=True,
        jira_site_url="https://m.atlassian.net" if with_jira else None,
        jira_user_email="agent@municorn.com" if with_jira else None,
        jira_project_key="PLAT" if with_jira else None,
        notion_section_url=(
            "https://www.notion.so/m/Notes-1a2b3c4d5e6f7081920a1b2c3d4e5f60"
            if with_notion
            else None
        ),
        notion_page_id="1a2b3c4d5e6f7081920a1b2c3d4e5f60" if with_notion else None,
    )
    project.credential = ProjectCredential(
        google_refresh_token=refresh_token,
        jira_api_token="jira-secret" if with_jira else None,
        notion_token="ntn-secret" if with_notion else None,
    )
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


JIRA_PAYLOAD = {
    "site_url": "https://new.atlassian.net",
    "user_email": "agent@municorn.com",
    "api_token": "new-jira-token",
    "project_key": "NEW",
}

NOTION_PAYLOAD = {
    "token": "ntn_new",
    "section_url": "https://www.notion.so/m/Docs-abcdef0123456789abcdef0123456789",
}


# --- GET /projects/{id}/integrations ---


def test_get_requires_auth(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    assert client.get(f"/projects/{project.id}/integrations").status_code == 401


def test_get_404_for_non_member(client, db_session):
    owner = _make_user(db_session)
    project = _make_project(db_session, owner)
    outsider = _make_user(db_session, email="bob@municorn.com", sub="sub-bob")
    resp = client.get(
        f"/projects/{project.id}/integrations", headers=_auth(outsider.id)
    )
    assert resp.status_code == 404


def test_get_reports_unconfigured_state(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.get(f"/projects/{project.id}/integrations", headers=_auth(user.id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["google"] == {
        "connected": True,
        "agent_email": "agent@municorn.com",
    }
    assert body["jira"]["configured"] is False
    assert body["notion"]["configured"] is False


def test_get_reports_configured_state_without_secrets(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user, with_jira=True, with_notion=True)
    resp = client.get(f"/projects/{project.id}/integrations", headers=_auth(user.id))
    body = resp.json()
    assert body["jira"] == {
        "configured": True,
        "site_url": "https://m.atlassian.net",
        "user_email": "agent@municorn.com",
        "project_key": "PLAT",
    }
    assert body["notion"]["configured"] is True
    assert body["notion"]["page_id"] == "1a2b3c4d5e6f7081920a1b2c3d4e5f60"
    # No token/secret ever leaves the API.
    assert "jira-secret" not in resp.text
    assert "ntn-secret" not in resp.text
    assert "1//rt" not in resp.text


def test_jira_not_configured_when_token_missing(client, db_session):
    """Site fields without a stored token (e.g. cleared credential) ≠ configured."""
    user = _make_user(db_session)
    project = _make_project(db_session, user, with_jira=True)
    project.credential.jira_api_token = None
    db_session.commit()
    resp = client.get(f"/projects/{project.id}/integrations", headers=_auth(user.id))
    assert resp.json()["jira"]["configured"] is False


# --- PUT /projects/{id}/integrations/jira ---


def test_put_jira_404_for_non_member(client, db_session):
    owner = _make_user(db_session)
    project = _make_project(db_session, owner)
    outsider = _make_user(db_session, email="bob@municorn.com", sub="sub-bob")
    resp = client.put(
        f"/projects/{project.id}/integrations/jira",
        headers=_auth(outsider.id),
        json=JIRA_PAYLOAD,
    )
    assert resp.status_code == 404


def test_put_jira_validates_then_saves(client, db_session, validators):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.put(
        f"/projects/{project.id}/integrations/jira",
        headers=_auth(user.id),
        json=JIRA_PAYLOAD,
    )
    assert resp.status_code == 200
    assert resp.json()["jira"]["configured"] is True
    assert resp.json()["jira"]["site_url"] == "https://new.atlassian.net"
    # The pasted credentials were live-checked before saving.
    assert validators.jira_calls == [
        {
            "site_url": "https://new.atlassian.net",
            "user_email": "agent@municorn.com",
            "api_token": "new-jira-token",
        }
    ]
    db_session.refresh(project)
    assert project.jira_site_url == "https://new.atlassian.net"
    assert project.jira_project_key == "NEW"
    assert project.credential.jira_api_token == "new-jira-token"


def test_put_jira_422_when_invalid_and_saves_nothing(client, db_session, validators):
    user = _make_user(db_session)
    project = _make_project(db_session, user, with_jira=True)
    validators.jira_result = ValidationResult(ok=False, error="HTTP 401")
    resp = client.put(
        f"/projects/{project.id}/integrations/jira",
        headers=_auth(user.id),
        json=JIRA_PAYLOAD,
    )
    assert resp.status_code == 422
    db_session.refresh(project)
    assert project.jira_site_url == "https://m.atlassian.net"  # untouched
    assert project.credential.jira_api_token == "jira-secret"


def test_put_jira_creates_credential_row_when_missing(client, db_session):
    user = _make_user(db_session)
    project = Project(
        owner_id=user.id,
        name="Bare",
        agent_email="agent@municorn.com",
        google_connected=False,
    )
    project.members.append(ProjectMember(user_id=user.id, role=ProjectRole.admin))
    db_session.add(project)
    db_session.commit()
    resp = client.put(
        f"/projects/{project.id}/integrations/jira",
        headers=_auth(user.id),
        json=JIRA_PAYLOAD,
    )
    assert resp.status_code == 200
    db_session.refresh(project)
    assert project.credential.jira_api_token == "new-jira-token"


# --- PUT /projects/{id}/integrations/notion ---


def test_put_notion_validates_then_saves(client, db_session, validators):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.put(
        f"/projects/{project.id}/integrations/notion",
        headers=_auth(user.id),
        json=NOTION_PAYLOAD,
    )
    assert resp.status_code == 200
    body = resp.json()["notion"]
    assert body["configured"] is True
    assert body["page_id"] == "abcdef0123456789abcdef0123456789"
    assert validators.notion_calls == [{"token": "ntn_new"}]
    db_session.refresh(project)
    assert project.credential.notion_token == "ntn_new"
    assert project.notion_page_id == "abcdef0123456789abcdef0123456789"


def test_put_notion_422_when_invalid(client, db_session, validators):
    user = _make_user(db_session)
    project = _make_project(db_session, user, with_notion=True)
    validators.notion_result = ValidationResult(ok=False, error="HTTP 401")
    resp = client.put(
        f"/projects/{project.id}/integrations/notion",
        headers=_auth(user.id),
        json=NOTION_PAYLOAD,
    )
    assert resp.status_code == 422
    db_session.refresh(project)
    assert project.credential.notion_token == "ntn-secret"  # untouched


# --- PUT /projects/{id}/integrations/google (reconnect) ---


def _stage_grant(db, user: User, *, email="agent2@municorn.com") -> PendingOAuth:
    pending = PendingOAuth(
        user_id=user.id,
        provider="google",
        account_email=email,
        refresh_token="1//new-rt",
        scopes="cal",
    )
    db.add(pending)
    db.commit()
    db.refresh(pending)
    return pending


def test_put_google_consumes_grant_and_reconnects(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user, refresh_token=None)
    project.google_connected = False
    db_session.commit()
    pending = _stage_grant(db_session, user)

    resp = client.put(
        f"/projects/{project.id}/integrations/google",
        headers=_auth(user.id),
        json={"google_auth_session_id": pending.id},
    )
    assert resp.status_code == 200
    assert resp.json()["google"] == {
        "connected": True,
        "agent_email": "agent2@municorn.com",
    }
    db_session.refresh(project)
    assert project.google_connected is True
    assert project.agent_email == "agent2@municorn.com"
    assert project.credential.google_refresh_token == "1//new-rt"
    assert db_session.get(PendingOAuth, pending.id) is None  # one-shot consumed


def test_put_google_400_on_unknown_or_foreign_grant(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    other = _make_user(db_session, email="bob@municorn.com", sub="sub-bob")
    foreign = _stage_grant(db_session, other)

    for sid in ["nope", foreign.id]:
        resp = client.put(
            f"/projects/{project.id}/integrations/google",
            headers=_auth(user.id),
            json={"google_auth_session_id": sid},
        )
        assert resp.status_code == 400


# --- POST /projects/{id}/integrations/{provider}/test (stored credentials) ---


def test_test_jira_uses_stored_credentials(client, db_session, validators):
    user = _make_user(db_session)
    project = _make_project(db_session, user, with_jira=True)
    resp = client.post(
        f"/projects/{project.id}/integrations/jira/test", headers=_auth(user.id)
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert validators.jira_calls == [
        {
            "site_url": "https://m.atlassian.net",
            "user_email": "agent@municorn.com",
            "api_token": "jira-secret",
        }
    ]


def test_test_jira_409_when_not_configured(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.post(
        f"/projects/{project.id}/integrations/jira/test", headers=_auth(user.id)
    )
    assert resp.status_code == 409


def test_test_jira_reports_failure(client, db_session, validators):
    user = _make_user(db_session)
    project = _make_project(db_session, user, with_jira=True)
    validators.jira_result = ValidationResult(ok=False, error="HTTP 401")
    resp = client.post(
        f"/projects/{project.id}/integrations/jira/test", headers=_auth(user.id)
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": False, "detail": None, "error": "HTTP 401"}


def test_test_notion_uses_stored_token(client, db_session, validators):
    user = _make_user(db_session)
    project = _make_project(db_session, user, with_notion=True)
    resp = client.post(
        f"/projects/{project.id}/integrations/notion/test", headers=_auth(user.id)
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert validators.notion_calls == [{"token": "ntn-secret"}]


def test_test_notion_409_when_not_configured(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.post(
        f"/projects/{project.id}/integrations/notion/test", headers=_auth(user.id)
    )
    assert resp.status_code == 409


def test_test_google_probes_calendar(client, db_session, fake_calendar):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.post(
        f"/projects/{project.id}/integrations/google/test", headers=_auth(user.id)
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert fake_calendar.last_refresh_token == "1//rt"


def test_test_google_409_when_no_grant(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user, refresh_token=None)
    resp = client.post(
        f"/projects/{project.id}/integrations/google/test", headers=_auth(user.id)
    )
    assert resp.status_code == 409


def test_test_google_reports_revoked_and_marks_disconnected(
    client, db_session, fake_calendar
):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    fake_calendar.error = GoogleAuthRevokedError("revoked")
    resp = client.post(
        f"/projects/{project.id}/integrations/google/test", headers=_auth(user.id)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "revoked" in body["error"]
    db_session.refresh(project)
    assert project.google_connected is False


def test_test_google_reports_upstream_failure(client, db_session, fake_calendar):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    fake_calendar.error = GoogleCalendarError("boom")
    resp = client.post(
        f"/projects/{project.id}/integrations/google/test", headers=_auth(user.id)
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is False
    db_session.refresh(project)
    assert project.google_connected is True  # upstream blip ≠ broken grant


def test_test_unknown_provider_404(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.post(
        f"/projects/{project.id}/integrations/slack/test", headers=_auth(user.id)
    )
    assert resp.status_code == 404
