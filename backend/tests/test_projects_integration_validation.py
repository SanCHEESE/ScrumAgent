"""Jira + Notion token validation (ScrumAgent-lb9.3).

Two layers: the protected /test endpoints (wired via injected validators) and the
real ``IntegrationValidators`` HTTP logic (exercised against ``httpx.MockTransport``
— no network, no extra deps). Plus the pure Notion section-URL → page-id parser.
"""
import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.integrations import (
    IntegrationValidators,
    ValidationResult,
    parse_notion_page_id,
)
from app.main import app
from app.models import User
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


def _make_user(db) -> User:
    user = User(google_sub="sub-alice", email="alice@municorn.com", name="Alice")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(uid: int) -> dict:
    token = create_access_token(str(uid), SECRET, extra={"env": "production"})
    return {"Authorization": f"Bearer {token}"}


class FakeValidators:
    def __init__(self, jira: ValidationResult, notion: ValidationResult) -> None:
        self._jira = jira
        self._notion = notion

    async def validate_jira(self, **_kw) -> ValidationResult:
        return self._jira

    async def validate_notion(self, **_kw) -> ValidationResult:
        return self._notion


def _mock(handler) -> IntegrationValidators:
    return IntegrationValidators(
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


@pytest.fixture
def client(db_session):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- endpoint wiring + auth ---

def test_jira_test_requires_auth(client):
    resp = client.post(
        "/projects/integrations/jira/test",
        json={"site_url": "x", "user_email": "a", "api_token": "t"},
    )
    assert resp.status_code == 401


def test_notion_test_requires_auth(client):
    resp = client.post("/projects/integrations/notion/test", json={"token": "t"})
    assert resp.status_code == 401


def test_jira_test_returns_ok(client, db_session):
    user = _make_user(db_session)
    app.dependency_overrides[deps.get_integration_validators] = lambda: FakeValidators(
        jira=ValidationResult(ok=True, detail={"email": "agent@municorn.com"}),
        notion=ValidationResult(ok=True),
    )
    resp = client.post(
        "/projects/integrations/jira/test",
        headers=_auth(user.id),
        json={
            "site_url": "https://m.atlassian.net",
            "user_email": "agent@municorn.com",
            "api_token": "tok",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["detail"]["email"] == "agent@municorn.com"


def test_jira_test_reports_invalid_token(client, db_session):
    user = _make_user(db_session)
    app.dependency_overrides[deps.get_integration_validators] = lambda: FakeValidators(
        jira=ValidationResult(ok=False, error="HTTP 401"),
        notion=ValidationResult(ok=True),
    )
    resp = client.post(
        "/projects/integrations/jira/test",
        headers=_auth(user.id),
        json={"site_url": "x", "user_email": "a", "api_token": "bad"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is False
    assert "401" in resp.json()["error"]


def test_notion_test_returns_ok(client, db_session):
    user = _make_user(db_session)
    app.dependency_overrides[deps.get_integration_validators] = lambda: FakeValidators(
        jira=ValidationResult(ok=True),
        notion=ValidationResult(ok=True, detail={"name": "Kabanchik bot"}),
    )
    resp = client.post(
        "/projects/integrations/notion/test",
        headers=_auth(user.id),
        json={"token": "ntn_x"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


# --- real validator HTTP logic (httpx.MockTransport) ---

def test_validate_jira_maps_200_to_ok():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/api/3/myself"
        assert request.headers["Authorization"].startswith("Basic ")
        return httpx.Response(
            200, json={"accountId": "abc", "emailAddress": "agent@municorn.com"}
        )

    result = asyncio.run(
        _mock(handler).validate_jira(
            site_url="https://m.atlassian.net/",
            user_email="agent@municorn.com",
            api_token="tok",
        )
    )
    assert result.ok is True
    assert result.detail["email"] == "agent@municorn.com"


def test_validate_jira_maps_error_status():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "unauthorized"})

    result = asyncio.run(
        _mock(handler).validate_jira(
            site_url="https://m.atlassian.net",
            user_email="a@municorn.com",
            api_token="bad",
        )
    )
    assert result.ok is False
    assert "401" in result.error


def test_validate_notion_maps_200_to_ok():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.notion.com"
        assert request.headers["Authorization"] == "Bearer ntn_secret"
        assert request.headers["Notion-Version"]
        return httpx.Response(200, json={"id": "bot-1", "name": "Kabanchik"})

    result = asyncio.run(_mock(handler).validate_notion(token="ntn_secret"))
    assert result.ok is True
    assert result.detail["name"] == "Kabanchik"


def test_validate_notion_maps_error_status():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={})

    result = asyncio.run(_mock(handler).validate_notion(token="bad"))
    assert result.ok is False


# --- Notion section URL -> page id ---

def test_parse_notion_page_id_from_dashed_url():
    url = "https://www.notion.so/municorn/Sprint-Notes-1a2b3c4d5e6f7081920a1b2c3d4e5f60"
    assert parse_notion_page_id(url) == "1a2b3c4d5e6f7081920a1b2c3d4e5f60"


def test_parse_notion_page_id_ignores_view_query():
    url = (
        "https://www.notion.so/municorn/"
        "Board-abcdef0123456789abcdef0123456789?v=00000000000000000000000000000000"
    )
    assert parse_notion_page_id(url) == "abcdef0123456789abcdef0123456789"


def test_parse_notion_page_id_none_when_absent():
    assert parse_notion_page_id("https://www.notion.so/municorn/Sprint-Notes") is None
    assert parse_notion_page_id("") is None
