"""Signed, short-lived ``state`` tokens for OAuth round-trips.

The agent-Google flow can't lean on a server cookie — the consent popup is opened
cross-origin from the SPA, so a ``SameSite`` cookie set on the JSON ``/start`` call
wouldn't reliably ride along to the ``/callback`` leg. Instead the CSRF + identity
binding travels inside a signed ``state`` JWT that the callback verifies with no
server-side lookup. A fixed ``purpose`` claim stops a login token being replayed here.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

ALGORITHM = "HS256"
_PURPOSE = "oauth_state"


def sign_oauth_state(secret_key: str, *, ttl_seconds: int = 600, **claims: Any) -> str:
    """Sign ``claims`` into a short-lived state token (default 10 min)."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
        "purpose": _PURPOSE,
        **claims,
    }
    return jwt.encode(payload, secret_key, algorithm=ALGORITHM)


def verify_oauth_state(token: str, secret_key: str) -> dict[str, Any]:
    """Verify signature + expiry + purpose, returning the claims. Raises ``JWTError``."""
    payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
    if payload.get("purpose") != _PURPOSE:
        raise JWTError("unexpected state purpose")
    return payload
