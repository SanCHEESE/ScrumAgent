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


def test_callback_rejects_non_allowed_domain(make_client):
    outsider = {
        "sub": "google-sub-999",
        "email": "mallory@gmail.com",
        "email_verified": True,
        "name": "Mallory",
    }
    client = make_client(outsider)
    start = client.get("/auth/google/start")
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    resp = client.get(
        "/auth/google/callback", params={"code": "auth-code", "state": state}
    )
    assert resp.status_code == 403


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
