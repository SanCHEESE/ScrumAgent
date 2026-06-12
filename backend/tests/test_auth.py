"""End-to-end auth flow tests (HTTP level, fake Google + in-memory DB).

Covers the acceptance criteria for ScrumAgent-u2b: happy path, non-allowed
domain rejection, and expired/invalid JWT rejection.
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from app.security import create_access_token, decode_access_token


def _token_from_redirect(location: str) -> str:
    # Backend redirects to {frontend}/login#token=<jwt>
    return location.split("#token=", 1)[1]


def _login(client) -> str:
    """Run start + callback, return the issued JWT."""
    start = client.get("/auth/google/start")
    assert start.status_code == 307
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    cb = client.get(
        "/auth/google/callback", params={"code": "auth-code", "state": state}
    )
    assert cb.status_code == 302, cb.text
    return _token_from_redirect(cb.headers["location"])


def test_start_redirects_to_google_consent(make_client, municorn_userinfo):
    client = make_client(municorn_userinfo)
    resp = client.get("/auth/google/start")
    assert resp.status_code == 307
    loc = resp.headers["location"]
    assert loc.startswith("https://accounts.google.com/")
    assert "state=" in loc
    # CSRF state is pinned to a cookie for the callback to verify.
    assert "oauth_state" in resp.headers.get("set-cookie", "")


def test_callback_allowed_domain_issues_jwt(make_client, municorn_userinfo):
    client = make_client(municorn_userinfo)
    token = _login(client)
    payload = decode_access_token(token, "router-test-secret")
    assert payload["email"] == "alice@municorn.com"
    assert payload["sub"]  # user id present


def test_callback_upserts_user_idempotently(make_client, municorn_userinfo, db_session):
    from app.models import User

    client = make_client(municorn_userinfo)
    _login(client)
    _login(client)  # same google sub logs in twice
    assert db_session.query(User).count() == 1


def _start_state(client) -> str:
    start = client.get("/auth/google/start")
    return parse_qs(urlparse(start.headers["location"]).query)["state"][0]


def test_callback_rejects_non_allowed_domain(make_client):
    outsider = {
        "sub": "google-sub-999",
        "email": "mallory@gmail.com",
        "email_verified": True,
        "name": "Mallory",
    }
    client = make_client(outsider)
    state = _start_state(client)
    resp = client.get(
        "/auth/google/callback", params={"code": "auth-code", "state": state}
    )
    # User-facing denial: back to the login screen with an error code, not JSON.
    assert resp.status_code == 302
    assert resp.headers["location"].endswith("/login?error=domain_not_allowed")
    assert "#token=" not in resp.headers["location"]


def test_callback_rejects_unverified_email(make_client):
    unverified = {
        "sub": "google-sub-777",
        "email": "fake@municorn.com",
        "email_verified": False,
        "name": "Fake",
    }
    client = make_client(unverified)
    state = _start_state(client)
    resp = client.get(
        "/auth/google/callback", params={"code": "auth-code", "state": state}
    )
    assert resp.status_code == 302
    assert resp.headers["location"].endswith("/login?error=domain_not_allowed")


def test_callback_consent_cancel_redirects_to_login(make_client, municorn_userinfo):
    """Google sends ``error=access_denied`` (no code) when the user cancels."""
    client = make_client(municorn_userinfo)
    state = _start_state(client)
    resp = client.get(
        "/auth/google/callback", params={"error": "access_denied", "state": state}
    )
    assert resp.status_code == 302
    assert resp.headers["location"].endswith("/login?error=access_denied")


def test_callback_exchange_failure_redirects_to_login(make_client, municorn_userinfo):
    import httpx

    from app import deps as deps_module
    from app.main import app

    class BrokenOAuth:
        def authorization_url(self, state: str, *, hosted_domain=None) -> str:
            return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

        async def exchange_code(self, code: str) -> dict:
            raise httpx.ConnectError("boom")

    client = make_client(municorn_userinfo)
    app.dependency_overrides[deps_module.get_google_oauth] = lambda: BrokenOAuth()
    state = _start_state(client)
    resp = client.get(
        "/auth/google/callback", params={"code": "auth-code", "state": state}
    )
    assert resp.status_code == 302
    assert resp.headers["location"].endswith("/login?error=exchange_failed")


def test_callback_rejects_state_mismatch(make_client, municorn_userinfo):
    client = make_client(municorn_userinfo)
    client.get("/auth/google/start")  # sets a cookie with a different state
    resp = client.get(
        "/auth/google/callback", params={"code": "auth-code", "state": "forged"}
    )
    assert resp.status_code == 400


def test_me_returns_current_user_with_valid_token(make_client, municorn_userinfo):
    client = make_client(municorn_userinfo)
    token = _login(client)
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@municorn.com"


def test_me_rejects_missing_token(make_client, municorn_userinfo):
    client = make_client(municorn_userinfo)
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_me_rejects_invalid_token(make_client, municorn_userinfo):
    client = make_client(municorn_userinfo)
    resp = client.get("/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401


def test_me_rejects_expired_token(make_client, municorn_userinfo):
    client = make_client(municorn_userinfo)
    expired = create_access_token("1", "router-test-secret", ttl_hours=-1)
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401


def test_me_rejects_oauth_state_token_as_bearer(make_client, municorn_userinfo):
    """State JWTs share the signing key — they must never pass as a session."""
    from app.security import sign_oauth_state

    client = make_client(municorn_userinfo)
    state_token = sign_oauth_state("router-test-secret", sid="s", uid=1)
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {state_token}"})
    assert resp.status_code == 401


def test_me_rejects_non_numeric_sub(make_client, municorn_userinfo):
    """A malformed ``sub`` must yield 401, not a ValueError 500."""
    client = make_client(municorn_userinfo)
    weird = create_access_token("not-a-number", "router-test-secret")
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {weird}"})
    assert resp.status_code == 401
