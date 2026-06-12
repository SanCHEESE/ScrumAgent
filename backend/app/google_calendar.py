"""Google Calendar read client for the agent account (ScrumAgent-m5x).

The project's offline ``refresh_token`` (captured during provisioning, see
``routers/projects.py``) is exchanged for a short-lived access token, which is
then used to list events from the agent's *primary* calendar. Kept as an
injectable object (``deps.get_google_calendar``) so tests swap it for a fake
with no network.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


class GoogleCalendarError(Exception):
    """Upstream Google failure (network, 5xx, malformed response)."""


class GoogleAuthRevokedError(GoogleCalendarError):
    """The stored refresh token no longer works (``invalid_grant``)."""


class GoogleCalendarClient:
    def __init__(self, client_id: str, client_secret: str) -> None:
        self.client_id = client_id
        self.client_secret = client_secret

    async def list_events(
        self,
        refresh_token: str,
        *,
        time_min: datetime,
        time_max: datetime,
        max_results: int = 250,
    ) -> list[dict[str, Any]]:
        """Return raw Google event resources in [time_min, time_max].

        ``singleEvents=true`` expands recurring series into concrete instances.
        """
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                access_token = await self._access_token(client, refresh_token)
                resp = await client.get(
                    EVENTS_ENDPOINT,
                    params={
                        "timeMin": _rfc3339(time_min),
                        "timeMax": _rfc3339(time_max),
                        "singleEvents": "true",
                        "orderBy": "startTime",
                        "maxResults": str(max_results),
                    },
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                resp.raise_for_status()
                items = resp.json().get("items", [])
        except GoogleCalendarError:
            raise
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise GoogleCalendarError(str(exc)) from exc
        if not isinstance(items, list):
            raise GoogleCalendarError("unexpected events payload")
        return items

    async def _access_token(
        self, client: httpx.AsyncClient, refresh_token: str
    ) -> str:
        resp = await client.post(
            TOKEN_ENDPOINT,
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        if resp.status_code == 400 and "invalid_grant" in resp.text:
            raise GoogleAuthRevokedError("refresh token revoked or expired")
        resp.raise_for_status()
        return resp.json()["access_token"]


def _rfc3339(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")
