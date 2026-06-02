"""Google OAuth 2.0 client (authorization-code flow).

Thin wrapper over Google's three endpoints. ``authorization_url`` is pure (used
by ``/auth/google/start``); ``exchange_code`` + ``fetch_userinfo`` make the
network calls on the ``/auth/google/callback`` leg. Kept as an injectable object
(see ``deps.get_google_oauth``) so tests swap it for a fake with no network.

We read identity from the userinfo endpoint rather than verifying the id_token
locally: the token came straight from Google's token endpoint over TLS in
exchange for our client secret, so it is already trusted — and this keeps the
dependency set lean (no google-auth).
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"
SCOPES = ("openid", "email", "profile")
# The agent account grants Calendar (read + write events) so the agent can see
# and manage the team schedule. ``access_type=offline`` yields a refresh token.
AGENT_SCOPES = (
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.events",
)


class GoogleOAuthClient:
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    def authorization_url(
        self,
        state: str,
        *,
        hosted_domain: str | None = None,
        scopes: tuple[str, ...] | None = None,
        access_type: str = "online",
        prompt: str = "select_account",
    ) -> str:
        params: dict[str, str] = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": " ".join(scopes or SCOPES),
            "state": state,
            "access_type": access_type,
            "prompt": prompt,
        }
        if hosted_domain:
            params["hd"] = hosted_domain  # UI hint only — re-verified server-side
        return f"{AUTH_ENDPOINT}?{urlencode(params)}"

    async def exchange_code(self, code: str) -> dict[str, Any]:
        data = {
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(TOKEN_ENDPOINT, data=data)
            resp.raise_for_status()
            return resp.json()

    async def fetch_userinfo(self, access_token: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return resp.json()
