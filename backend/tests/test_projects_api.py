"""Projects + users API (ScrumAgent-lb9.4).

POST /projects ties the feature together: it consumes the one-shot PendingOAuth
(required), re-validates any provided Jira/Notion token server-side (422 on
failure — "if the keys are added, they must work"), and writes Project +
ProjectCredential + ProjectMember rows. GET /projects lists projects the caller is
a member of (owner included); GET /users/directory feeds the member picker.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import deps
from app.config import Settings
from app.google_calendar import GoogleCalendarError
from app.integrations import ValidationResult
from app.main import app
from app.models import PendingOAuth, Project, ProjectMember, User
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


def _user(db, email, sub) -> User:
    u = User(google_sub=sub, email=email, name=email.split("@")[0].title())
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _auth(uid: int) -> dict:
    token = create_access_token(str(uid), SECRET, extra={"env": "production"})
    return {"Authorization": f"Bearer {token}"}


def _seed_pending(db, user_id, sid="sess-1", email="telecom.scrum.agent@municorn.com"):
    db.add(
        PendingOAuth(
            id=sid,
            user_id=user_id,
            provider="google",
            account_email=email,
            refresh_token="1//agent-refresh",
            scopes="openid email https://www.googleapis.com/auth/calendar.events",
        )
    )
    db.commit()
    return sid


class FakeValidators:
    def __init__(self, ok: bool = True) -> None:
        self._result = ValidationResult(ok=ok, detail={"email": "x"}, error=None if ok else "HTTP 401")

    async def validate_jira(self, **_kw) -> ValidationResult:
        return self._result

    async def validate_notion(self, **_kw) -> ValidationResult:
        return self._result


class FakeCalendar:
    def __init__(self) -> None:
        self.events: list[dict] = [
            {
                "id": "evt-1",
                "status": "confirmed",
                "organizer": {"email": "lead@municorn.com", "displayName": "Lead"},
                "attendees": [
                    {"email": "bob@municorn.com", "displayName": "Bob"},
                    {"email": "carol@municorn.com", "displayName": "Carol"},
                    {"email": "telecom.scrum.agent@municorn.com", "displayName": "Agent"},
                ],
            },
            {
                "id": "evt-2",
                "status": "confirmed",
                "attendees": [
                    {"email": "bob@municorn.com", "displayName": "Robert"},
                    {"email": "outsider@example.com", "displayName": "External"},
                ],
            },
            {
                "id": "evt-3",
                "status": "cancelled",
                "attendees": [{"email": "cancelled@municorn.com"}],
            },
        ]
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
    yield TestClient(app)
    app.dependency_overrides.clear()


def _set_validators(ok: bool) -> None:
    app.dependency_overrides[deps.get_integration_validators] = lambda: FakeValidators(ok)


# --- /users/directory ---

def test_users_directory_requires_auth(client):
    assert client.get("/users/directory").status_code == 401


def test_users_directory_lists_users(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    _user(db_session, "bob@municorn.com", "sub-b")
    resp = client.get("/users/directory", headers=_auth(owner.id))
    assert resp.status_code == 200
    emails = {u["email"] for u in resp.json()}
    assert emails == {"alice@municorn.com", "bob@municorn.com"}
    assert all(set(u) == {"id", "email", "name"} for u in resp.json())  # no secrets


# --- Google pending-session meeting participant suggestions ---

def test_google_meeting_participants_require_auth(client):
    resp = client.get(
        "/projects/integrations/google/meeting-participants?auth_session_id=sess-1"
    )
    assert resp.status_code == 401


def test_google_meeting_participants_from_pending_session(client, db_session, fake_calendar):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    sid = _seed_pending(db_session, owner.id)
    resp = client.get(
        f"/projects/integrations/google/meeting-participants?auth_session_id={sid}",
        headers=_auth(owner.id),
    )
    assert resp.status_code == 200
    assert fake_calendar.last_refresh_token == "1//agent-refresh"
    assert resp.json() == [
        {"email": "lead@municorn.com", "display_name": "Lead", "event_count": 1},
        {"email": "bob@municorn.com", "display_name": "Bob", "event_count": 2},
        {"email": "carol@municorn.com", "display_name": "Carol", "event_count": 1},
        {"email": "outsider@example.com", "display_name": "External", "event_count": 1},
    ]


def test_google_meeting_participants_reject_other_users_session(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    bob = _user(db_session, "bob@municorn.com", "sub-b")
    sid = _seed_pending(db_session, owner.id)
    resp = client.get(
        f"/projects/integrations/google/meeting-participants?auth_session_id={sid}",
        headers=_auth(bob.id),
    )
    assert resp.status_code == 400


def test_google_meeting_participants_reports_upstream_failure(
    client, db_session, fake_calendar
):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    sid = _seed_pending(db_session, owner.id)
    fake_calendar.error = GoogleCalendarError("boom")
    resp = client.get(
        f"/projects/integrations/google/meeting-participants?auth_session_id={sid}",
        headers=_auth(owner.id),
    )
    assert resp.status_code == 502


# --- POST /projects ---

def test_create_project_requires_auth(client):
    assert client.post("/projects", json={"name": "P", "google_auth_session_id": "x"}).status_code == 401


def test_create_project_rejects_invalid_google_session(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    resp = client.post(
        "/projects",
        headers=_auth(owner.id),
        json={"name": "Platform", "google_auth_session_id": "does-not-exist"},
    )
    assert resp.status_code == 400


def test_create_project_consumes_pending_and_persists(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    sid = _seed_pending(db_session, owner.id)
    resp = client.post(
        "/projects",
        headers=_auth(owner.id),
        json={"name": "Platform", "google_auth_session_id": sid},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["google_connected"] is True
    assert body["agent_email"] == "telecom.scrum.agent@municorn.com"
    # owner is an admin member
    me = [m for m in body["members"] if m["user_id"] == owner.id]
    assert me and me[0]["role"] == "admin"
    # PendingOAuth consumed
    assert db_session.get(PendingOAuth, sid) is None
    # refresh token moved into the credential (decrypted via ORM)
    from app.models import ProjectCredential

    cred = db_session.get(ProjectCredential, body["id"])
    assert cred.google_refresh_token == "1//agent-refresh"
    # response leaks no secrets
    assert "refresh_token" not in resp.text and "1//agent-refresh" not in resp.text


def test_create_project_with_members_appears_in_their_list(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    bob = _user(db_session, "bob@municorn.com", "sub-b")
    carol = _user(db_session, "carol@municorn.com", "sub-c")
    sid = _seed_pending(db_session, owner.id)
    resp = client.post(
        "/projects",
        headers=_auth(owner.id),
        json={
            "name": "Platform",
            "google_auth_session_id": sid,
            "member_user_ids": [bob.id, carol.id],
        },
    )
    assert resp.status_code == 201
    assert len(resp.json()["members"]) == 3  # owner + 2

    # the project shows up in Bob's list
    bob_projects = client.get("/projects", headers=_auth(bob.id)).json()
    assert [p["name"] for p in bob_projects] == ["Platform"]


def test_create_project_with_member_roles(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    bob = _user(db_session, "bob@municorn.com", "sub-b")
    carol = _user(db_session, "carol@municorn.com", "sub-c")
    sid = _seed_pending(db_session, owner.id)
    resp = client.post(
        "/projects",
        headers=_auth(owner.id),
        json={
            "name": "Platform",
            "google_auth_session_id": sid,
            "members": [
                {"user_id": bob.id, "role": "viewer"},
                {"user_id": carol.id, "role": "admin"},
            ],
        },
    )
    assert resp.status_code == 201
    roles = {m["email"]: m["role"] for m in resp.json()["members"]}
    assert roles == {
        "alice@municorn.com": "admin",
        "bob@municorn.com": "viewer",
        "carol@municorn.com": "admin",
    }


def test_create_project_rejects_invalid_member_role(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    bob = _user(db_session, "bob@municorn.com", "sub-b")
    sid = _seed_pending(db_session, owner.id)
    resp = client.post(
        "/projects",
        headers=_auth(owner.id),
        json={
            "name": "Platform",
            "google_auth_session_id": sid,
            "members": [{"user_id": bob.id, "role": "owner"}],
        },
    )
    assert resp.status_code == 422


def test_create_project_rejects_invalid_jira_token(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    sid = _seed_pending(db_session, owner.id)
    _set_validators(ok=False)
    resp = client.post(
        "/projects",
        headers=_auth(owner.id),
        json={
            "name": "Platform",
            "google_auth_session_id": sid,
            "jira": {
                "site_url": "https://m.atlassian.net",
                "user_email": "a@municorn.com",
                "api_token": "bad",
            },
        },
    )
    assert resp.status_code == 422
    # nothing persisted, pending NOT consumed (validation happens first)
    assert db_session.query(Project).count() == 0
    assert db_session.get(PendingOAuth, sid) is not None


def test_create_project_stores_valid_jira_notion_encrypted(client, db_session):
    owner = _user(db_session, "alice@municorn.com", "sub-a")
    sid = _seed_pending(db_session, owner.id)
    _set_validators(ok=True)
    resp = client.post(
        "/projects",
        headers=_auth(owner.id),
        json={
            "name": "Platform",
            "google_auth_session_id": sid,
            "jira": {
                "site_url": "https://m.atlassian.net",
                "user_email": "a@municorn.com",
                "api_token": "jira-secret",
                "project_key": "PLAT",
            },
            "notion": {
                "token": "ntn_secret",
                "section_url": "https://www.notion.so/m/Notes-1a2b3c4d5e6f7081920a1b2c3d4e5f60",
            },
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["jira_project_key"] == "PLAT"
    assert body["notion_page_id"] == "1a2b3c4d5e6f7081920a1b2c3d4e5f60"

    raw = db_session.execute(
        text("SELECT jira_api_token, notion_token FROM project_credentials WHERE project_id=:p"),
        {"p": body["id"]},
    ).one()
    assert "jira-secret" not in (raw[0] or "")
    assert "ntn_secret" not in (raw[1] or "")


# --- GET /projects + detail ---

def test_list_projects_scoped_to_membership(client, db_session):
    alice = _user(db_session, "alice@municorn.com", "sub-a")
    bob = _user(db_session, "bob@municorn.com", "sub-b")
    client.post(
        "/projects",
        headers=_auth(alice.id),
        json={"name": "Alice P", "google_auth_session_id": _seed_pending(db_session, alice.id, sid="s-a")},
    )
    client.post(
        "/projects",
        headers=_auth(bob.id),
        json={"name": "Bob P", "google_auth_session_id": _seed_pending(db_session, bob.id, sid="s-b")},
    )
    alice_list = client.get("/projects", headers=_auth(alice.id)).json()
    assert [p["name"] for p in alice_list] == ["Alice P"]


def test_project_detail_hidden_from_non_members(client, db_session):
    alice = _user(db_session, "alice@municorn.com", "sub-a")
    bob = _user(db_session, "bob@municorn.com", "sub-b")
    created = client.post(
        "/projects",
        headers=_auth(alice.id),
        json={"name": "Alice P", "google_auth_session_id": _seed_pending(db_session, alice.id)},
    ).json()
    assert client.get(f"/projects/{created['id']}", headers=_auth(alice.id)).status_code == 200
    assert client.get(f"/projects/{created['id']}", headers=_auth(bob.id)).status_code == 404


def test_agent_preview_lists_and_reads_all_projects_without_bearer(client, db_session):
    """Codex/agent preview runs with an explicit all-project environment."""
    app.dependency_overrides[deps.get_settings] = _preview_settings
    alice = _user(db_session, "alice@municorn.com", "sub-a")
    bob = _user(db_session, "bob@municorn.com", "sub-b")
    alice_project = Project(
        owner_id=alice.id,
        name="Alice P",
        agent_email="agent-a@municorn.com",
        google_connected=True,
    )
    alice_project.members.append(
        ProjectMember(user_id=alice.id, role=ProjectRole.admin)
    )
    bob_project = Project(
        owner_id=bob.id,
        name="Bob P",
        agent_email="agent-b@municorn.com",
        google_connected=True,
    )
    bob_project.members.append(ProjectMember(user_id=bob.id, role=ProjectRole.admin))
    db_session.add_all([alice_project, bob_project])
    db_session.commit()
    db_session.refresh(alice_project)
    db_session.refresh(bob_project)

    listing = client.get("/projects")
    assert listing.status_code == 200
    assert [p["name"] for p in listing.json()] == ["Alice P", "Bob P"]
    assert client.get(f"/projects/{alice_project.id}").status_code == 200
    assert client.get(f"/projects/{bob_project.id}").status_code == 200
