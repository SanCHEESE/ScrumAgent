"""Google OAuth login + session issuance (ScrumAgent-u2b).

Flow: ``/auth/google/start`` redirects to Google consent (pinning a random
CSRF ``state`` to a cookie). Google redirects back to ``/auth/google/callback``,
which verifies the state, exchanges the code, enforces the ``@municorn.com``
domain, upserts the user, and hands a signed JWT back to the frontend via a
redirect fragment. ``/auth/me`` returns the current user for any holder of a
valid token.
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import Settings
from app.deps import get_current_user, get_db, get_google_oauth, get_settings
from app.models import User
from app.oauth import GoogleOAuthClient
from app.security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

STATE_COOKIE = "oauth_state"
STATE_TTL_SECONDS = 600


@router.get("/google/start")
def google_start(
    settings: Settings = Depends(get_settings),
    oauth: GoogleOAuthClient = Depends(get_google_oauth),
) -> RedirectResponse:
    state = secrets.token_urlsafe(24)
    url = oauth.authorization_url(state, hosted_domain=settings.allowed_domain)
    resp = RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    resp.set_cookie(
        STATE_COOKIE,
        state,
        max_age=STATE_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=settings.backend_base_url.startswith("https"),
    )
    return resp


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str,
    request: Request,
    settings: Settings = Depends(get_settings),
    oauth: GoogleOAuthClient = Depends(get_google_oauth),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    expected = request.cookies.get(STATE_COOKIE)
    if not expected or not secrets.compare_digest(expected, state):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid OAuth state")

    tokens = await oauth.exchange_code(code)
    userinfo = await oauth.fetch_userinfo(tokens["access_token"])

    email = (userinfo.get("email") or "").lower()
    allowed = settings.allowed_domain.lower()
    if userinfo.get("hd") != allowed and not email.endswith(f"@{allowed}"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Only @{settings.allowed_domain} accounts may sign in",
        )

    sub = userinfo["sub"]
    user = db.query(User).filter(User.google_sub == sub).one_or_none()
    if user is None:
        user = User(google_sub=sub, email=email, name=userinfo.get("name"))
        db.add(user)
    else:
        user.email = email
        user.name = userinfo.get("name")
    db.commit()
    db.refresh(user)

    token = create_access_token(
        str(user.id),
        settings.secret_key,
        ttl_hours=settings.jwt_ttl_hours,
        extra={"email": user.email},
    )
    resp = RedirectResponse(
        f"{settings.frontend_base_url}/login#token={token}",
        status_code=status.HTTP_302_FOUND,
    )
    resp.delete_cookie(STATE_COOKIE)
    return resp


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name}
