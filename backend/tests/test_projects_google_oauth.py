"""Agent Google offline-OAuth flow (ScrumAgent-lb9.2).

POST /projects/integrations/google/start issues an offline-access authorize URL
(refresh-token grant) bound to a signed state; GET .../callback exchanges the
code, enforces the agent's @municorn.com domain, and persists a one-shot
PendingOAuth row carrying the (encrypted) refresh token.
"""
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.main import app
from app.models import PendingOAuth, User
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


class FakeAgentOAuth:
    """Offline-flow stand-in: records params, returns a refresh token + email."""

    def __init__(self) -> None:
        self.email = "telecom.scrum.agent@municorn.com"
        self.refresh = "1//agent-refresh"
        self.last: dict = {}

    def authorization_url(
        self,
        state: str,
        *,
        hosted_domain: str | None = None,
        scopes=None,
        access_type: str = "online",
        prompt: str = "select_account",
    ) -> str:
        self.last = {
            "state": state,
            "scopes": list(scopes or []),
            "access_type": access_type,
            "prompt": prompt,
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    async def exchange_code(self, code: str) -> dict:
        tokens = {"access_token": "at"}
        if self.refresh is not None:
            tokens["refresh_token"] = self.refresh
        return tokens

    async def fetch_userinfo(self, access_token: str) -> dict:
        return {"sub": "agent-sub", "email": self.email, "email_verified": True}


@pytest.fixture
def fake_oauth() -> FakeAgentOAuth:
    return FakeAgentOAuth()


@pytest.fixture
def client(db_session, fake_oauth):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_agent_google_oauth] = lambda: fake_oauth
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


def _make_user(db, email="alice@municorn.com", sub="sub-alice") -> User:
    user = User(google_sub=sub, email=email, name="Alice")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(uid: int) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(uid), SECRET)}"}


def _state_from(authorize_url: str) -> str:
    return parse_qs(urlparse(authorize_url).query)["state"][0]


def test_google_start_requires_auth(client):
    assert client.post("/projects/integrations/google/start").status_code == 401


def test_google_start_returns_offline_url_and_session(client, db_session, fake_oauth):
    user = _make_user(db_session)
    resp = client.post(
        "/projects/integrations/google/start", headers=_auth(user.id)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["auth_session_id"]
    assert "accounts.google.com" in body["authorize_url"]
    assert fake_oauth.last["access_type"] == "offline"
    assert fake_oauth.last["prompt"] == "consent"
    assert any("calendar.events" in s for s in fake_oauth.last["scopes"])


def test_google_callback_persists_pending_oauth(client, db_session):
    user = _make_user(db_session)
    start = client.post(
        "/projects/integrations/google/start", headers=_auth(user.id)
    ).json()
    resp = client.get(
        "/projects/integrations/google/callback",
        params={"code": "xyz", "state": _state_from(start["authorize_url"])},
    )
    assert resp.status_code == 200
    assert "scrumagent-google-oauth" in resp.text
    assert start["auth_session_id"] in resp.text

    pending = db_session.get(PendingOAuth, start["auth_session_id"])
    assert pending is not None
    assert pending.user_id == user.id
    assert pending.provider == "google"
    assert pending.account_email == "telecom.scrum.agent@municorn.com"
    assert pending.refresh_token == "1//agent-refresh"  # decrypted via ORM


def test_google_callback_rejects_tampered_state(client, db_session):
    resp = client.get(
        "/projects/integrations/google/callback",
        params={"code": "x", "state": "not-a-valid-jwt"},
    )
    assert resp.status_code == 400


def test_google_callback_rejects_off_domain_account(client, db_session, fake_oauth):
    user = _make_user(db_session)
    start = client.post(
        "/projects/integrations/google/start", headers=_auth(user.id)
    ).json()
    fake_oauth.email = "evil@gmail.com"  # the consenting account is off-domain
    resp = client.get(
        "/projects/integrations/google/callback",
        params={"code": "x", "state": _state_from(start["authorize_url"])},
    )
    # Still the popup page (so the wizard hears back), but ok=false + no row.
    assert resp.status_code == 200
    assert '"ok": false' in resp.text
    assert "wrong_domain" in resp.text
    assert db_session.get(PendingOAuth, start["auth_session_id"]) is None


def test_google_callback_rejects_missing_refresh_token(client, db_session, fake_oauth):
    """A grant without offline access is useless — fail in the popup, not later."""
    user = _make_user(db_session)
    start = client.post(
        "/projects/integrations/google/start", headers=_auth(user.id)
    ).json()
    fake_oauth.refresh = None
    resp = client.get(
        "/projects/integrations/google/callback",
        params={"code": "x", "state": _state_from(start["authorize_url"])},
    )
    assert resp.status_code == 200
    assert '"ok": false' in resp.text
    assert "no_refresh_token" in resp.text
    assert db_session.get(PendingOAuth, start["auth_session_id"]) is None


def test_google_callback_exchange_failure_renders_popup(client, db_session, fake_oauth):
    import httpx

    async def _boom(code: str) -> dict:
        raise httpx.ConnectError("boom")

    user = _make_user(db_session)
    start = client.post(
        "/projects/integrations/google/start", headers=_auth(user.id)
    ).json()
    fake_oauth.exchange_code = _boom
    resp = client.get(
        "/projects/integrations/google/callback",
        params={"code": "x", "state": _state_from(start["authorize_url"])},
    )
    assert resp.status_code == 200
    assert '"ok": false' in resp.text
    assert "exchange_failed" in resp.text


def test_google_callback_replay_is_idempotent(client, db_session):
    """A refreshed/replayed callback page must not 500 on the duplicate PK."""
    user = _make_user(db_session)
    start = client.post(
        "/projects/integrations/google/start", headers=_auth(user.id)
    ).json()
    params = {"code": "xyz", "state": _state_from(start["authorize_url"])}
    first = client.get("/projects/integrations/google/callback", params=params)
    second = client.get("/projects/integrations/google/callback", params=params)
    assert first.status_code == 200
    assert second.status_code == 200
    assert '"ok": true' in second.text
    assert (
        db_session.query(PendingOAuth)
        .filter(PendingOAuth.id == start["auth_session_id"])
        .count()
        == 1
    )
