"""Project provisioning + per-project integrations (ScrumAgent-lb9).

Phase 2 lives here first: the agent-Google offline-OAuth handshake. ``/start`` is
called by the wizard (authenticated) and returns an authorize URL to open in a
popup; ``/callback`` is the redirect target Google sends the agent back to (its
identity rides in the signed ``state``, so it needs no bearer). The captured
refresh token lands in a one-shot ``PendingOAuth`` row, consumed later at project
creation.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from jose import JWTError
from sqlalchemy.orm import Session

from app.config import Settings
from app.deps import (
    get_agent_google_oauth,
    get_current_user,
    get_db,
    get_settings,
)
from app.models import PendingOAuth, User
from app.models.types import uuid_str
from app.oauth import AGENT_SCOPES, GoogleOAuthClient
from app.security import sign_oauth_state, verify_oauth_state

router = APIRouter(prefix="/projects", tags=["projects"])

GOOGLE_PROVIDER = "google"


@router.post("/integrations/google/start")
def google_start(
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    oauth: GoogleOAuthClient = Depends(get_agent_google_oauth),
) -> dict:
    """Begin the agent-Google offline-OAuth handshake."""
    session_id = uuid_str()
    state = sign_oauth_state(settings.secret_key, sid=session_id, uid=user.id)
    authorize_url = oauth.authorization_url(
        state,
        scopes=AGENT_SCOPES,
        access_type="offline",
        prompt="consent",
    )
    return {"authorize_url": authorize_url, "auth_session_id": session_id}


@router.get("/integrations/google/callback")
async def google_callback(
    state: str,
    code: str | None = None,
    error: str | None = None,
    settings: Settings = Depends(get_settings),
    oauth: GoogleOAuthClient = Depends(get_agent_google_oauth),
    db: Session = Depends(get_db),
) -> HTMLResponse:
    """Exchange the code, enforce the agent domain, and stage a PendingOAuth row."""
    try:
        payload = verify_oauth_state(state, settings.secret_key)
    except JWTError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Invalid OAuth state"
        ) from exc

    session_id = str(payload["sid"])
    user_id = int(payload["uid"])

    if error or not code:
        return _popup_html(
            settings, ok=False, session_id=session_id, error=error or "missing_code"
        )

    tokens = await oauth.exchange_code(code)
    userinfo = await oauth.fetch_userinfo(tokens["access_token"])
    email = (userinfo.get("email") or "").lower()

    if not email.endswith(f"@{settings.allowed_domain.lower()}"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Agent account must be @{settings.allowed_domain}",
        )

    db.add(
        PendingOAuth(
            id=session_id,
            user_id=user_id,
            provider=GOOGLE_PROVIDER,
            account_email=email,
            refresh_token=tokens.get("refresh_token"),
            scopes=" ".join(AGENT_SCOPES),
        )
    )
    db.commit()

    return _popup_html(settings, ok=True, session_id=session_id, email=email)


def _popup_html(
    settings: Settings,
    *,
    ok: bool,
    session_id: str,
    email: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    """Render the popup page that hands the result back to the wizard and closes."""
    message: dict = {
        "source": "scrumagent-google-oauth",
        "ok": ok,
        "authSessionId": session_id,
    }
    if email:
        message["email"] = email
    if error:
        message["error"] = error

    body = f"""<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
(function() {{
  var message = {json.dumps(message)};
  if (window.opener) {{
    window.opener.postMessage(message, {json.dumps(settings.frontend_base_url)});
  }}
  window.close();
}})();
</script>
<p>You can close this window.</p>
</body></html>"""
    return HTMLResponse(body)
