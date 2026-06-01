"""Shared fixtures for auth/router tests.

Wires the FastAPI app against an in-memory SQLite (shared across sessions via a
StaticPool so rows survive between requests) and fake Google OAuth, so the full
login flow is exercised without a real network round-trip or on-disk DB.
"""
from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import deps
from app.config import Settings
from app.database import Base
from app.main import app

TEST_SECRET = "router-test-secret"


def _make_settings() -> Settings:
    return Settings(
        _env_file=None,
        secret_key=TEST_SECRET,
        openai_api_key="k",
        google_client_id="test-client-id",
        google_client_secret="test-client-secret",
        backend_base_url="http://testserver",
        frontend_base_url="http://localhost:3000",
        allowed_domain="municorn.com",
    )


class FakeGoogleOAuth:
    """Stand-in for ``GoogleOAuthClient`` — canned userinfo, no network."""

    def __init__(self, userinfo: dict) -> None:
        self._userinfo = userinfo

    def authorization_url(self, state: str, *, hosted_domain: str | None = None) -> str:
        return (
            "https://accounts.google.com/o/oauth2/v2/auth"
            f"?client_id=test-client-id&state={state}"
        )

    async def exchange_code(self, code: str) -> dict:
        return {"access_token": "fake-access-token", "id_token": "fake-id-token"}

    async def fetch_userinfo(self, access_token: str) -> dict:
        return self._userinfo


@pytest.fixture
def db_session() -> Iterator[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, future=True)
    db = factory()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


@pytest.fixture
def make_client(db_session: Session):
    """Factory: build a TestClient whose Google login returns ``userinfo``."""

    def _override_db() -> Iterator[Session]:
        yield db_session

    def _build(userinfo: dict) -> TestClient:
        app.dependency_overrides[deps.get_settings] = _make_settings
        app.dependency_overrides[deps.get_db] = _override_db
        app.dependency_overrides[deps.get_google_oauth] = lambda: FakeGoogleOAuth(
            userinfo
        )
        return TestClient(app, follow_redirects=False)

    yield _build
    app.dependency_overrides.clear()


@pytest.fixture
def municorn_userinfo() -> dict:
    return {
        "sub": "google-sub-123",
        "email": "alice@municorn.com",
        "email_verified": True,
        "hd": "municorn.com",
        "name": "Alice",
    }
