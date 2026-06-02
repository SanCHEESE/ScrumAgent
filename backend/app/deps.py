"""Shared FastAPI dependencies.

``get_settings`` / ``get_engine`` / ``get_db`` are the persistence injection
points; ``get_google_oauth`` and ``get_current_user`` back the auth flow. All
are cached or built per-request as appropriate, and every one is overridable in
tests via ``app.dependency_overrides``.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Iterator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.database import make_engine, make_session_factory
from app.integrations import IntegrationValidators
from app.models import User
from app.oauth import GoogleOAuthClient
from app.security import decode_access_token


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_engine() -> Engine:
    return make_engine(get_settings().database_url)


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return make_session_factory(get_engine())


def get_db() -> Iterator[Session]:
    db = _session_factory()()
    try:
        yield db
    finally:
        db.close()


def get_google_oauth(settings: Settings = Depends(get_settings)) -> GoogleOAuthClient:
    return GoogleOAuthClient(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=f"{settings.backend_base_url}/auth/google/callback",
    )


def get_agent_google_oauth(
    settings: Settings = Depends(get_settings),
) -> GoogleOAuthClient:
    """OAuth client for the *agent's* Google account (offline / Calendar grant).

    Same Google app as the login client, but a distinct redirect URI so the
    consent popup returns to the project-provisioning callback.
    """
    return GoogleOAuthClient(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=(
            f"{settings.backend_base_url}/projects/integrations/google/callback"
        ),
    )


def get_integration_validators() -> IntegrationValidators:
    """Live Jira/Notion credential checkers (network-touching; faked in tests)."""
    return IntegrationValidators()


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the bearer JWT to a ``User`` or raise 401."""
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = decode_access_token(credentials.credentials, settings.secret_key)
    except JWTError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired token"
        ) from exc
    user = db.get(User, int(payload.get("sub", 0)))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user
