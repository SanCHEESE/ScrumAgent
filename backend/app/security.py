"""JWT signing for backend-issued sessions.

A single HS256 token carries the user id (``sub``) plus a few convenience
claims (e.g. email). Tokens are verified by the ``get_current_user`` dependency
on every protected route. Issued at login (``routers/auth.py``); the signing key
is ``settings.secret_key``.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt

ALGORITHM = "HS256"


def create_access_token(
    subject: str,
    secret_key: str,
    *,
    ttl_hours: int = 24,
    extra: dict[str, Any] | None = None,
) -> str:
    """Sign a token for ``subject`` expiring ``ttl_hours`` from now."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(hours=ttl_hours),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str, secret_key: str) -> dict[str, Any]:
    """Verify signature + expiry and return the claims. Raises ``JWTError``."""
    return jwt.decode(token, secret_key, algorithms=[ALGORITHM])
