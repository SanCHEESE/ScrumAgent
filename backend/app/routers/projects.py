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
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from jose import JWTError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import Settings
from app.deps import (
    get_agent_google_oauth,
    get_current_user,
    get_db,
    get_google_calendar,
    get_integration_validators,
    get_settings,
)
from app.google_calendar import (
    GoogleAuthRevokedError,
    GoogleCalendarClient,
    GoogleCalendarError,
)
from app.integrations import IntegrationValidators, parse_notion_page_id
from app.models import (
    PendingOAuth,
    Project,
    ProjectCredential,
    ProjectMember,
    User,
)
from app.models.types import ProjectRole, uuid_str
from app.oauth import AGENT_SCOPES, GoogleOAuthClient
from app.security import sign_oauth_state, verify_oauth_state

router = APIRouter(prefix="/projects", tags=["projects"])

GOOGLE_PROVIDER = "google"


class JiraTestRequest(BaseModel):
    site_url: str
    user_email: str
    api_token: str


class NotionTestRequest(BaseModel):
    token: str


class JiraConfig(BaseModel):
    site_url: str
    user_email: str
    api_token: str
    project_key: str | None = None


class NotionConfig(BaseModel):
    token: str
    section_url: str


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    color: str = "#0077e6"
    # The agent's Google account is taken from the consented OAuth grant, not the
    # client — you can't claim an account you didn't authorize.
    google_auth_session_id: str
    jira: JiraConfig | None = None
    notion: NotionConfig | None = None
    member_user_ids: list[int] = Field(default_factory=list)


class MemberOut(BaseModel):
    user_id: int
    email: str
    name: str | None
    role: str


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str | None
    color: str
    agent_email: str
    google_connected: bool
    jira_site_url: str | None
    jira_user_email: str | None
    jira_project_key: str | None
    notion_section_url: str | None
    notion_page_id: str | None
    members: list[MemberOut]
    created_at: datetime


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

    # Every failure below must still render the popup page — a raised JSON
    # error would never postMessage back, leaving the wizard stuck on Waiting.
    try:
        tokens = await oauth.exchange_code(code)
        userinfo = await oauth.fetch_userinfo(tokens["access_token"])
    except (httpx.HTTPError, KeyError):
        return _popup_html(
            settings, ok=False, session_id=session_id, error="exchange_failed"
        )

    email = (userinfo.get("email") or "").lower()
    if not userinfo.get("email_verified", False) or not email.endswith(
        f"@{settings.allowed_domain.lower()}"
    ):
        return _popup_html(
            settings, ok=False, session_id=session_id, error="wrong_domain"
        )

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        # Without offline access the grant is useless to the agent — surface it
        # now instead of failing project creation later with a cryptic 400.
        return _popup_html(
            settings, ok=False, session_id=session_id, error="no_refresh_token"
        )

    if db.get(PendingOAuth, session_id) is None:  # replayed callback → idempotent
        db.add(
            PendingOAuth(
                id=session_id,
                user_id=user_id,
                provider=GOOGLE_PROVIDER,
                account_email=email,
                refresh_token=refresh_token,
                scopes=" ".join(AGENT_SCOPES),
            )
        )
        db.commit()

    return _popup_html(settings, ok=True, session_id=session_id, email=email)


@router.post("/integrations/jira/test")
async def jira_test(
    req: JiraTestRequest,
    _user: User = Depends(get_current_user),
    validators: IntegrationValidators = Depends(get_integration_validators),
) -> dict:
    """Confirm a Jira site + token actually authenticate."""
    result = await validators.validate_jira(
        site_url=req.site_url, user_email=req.user_email, api_token=req.api_token
    )
    return {"ok": result.ok, "detail": result.detail, "error": result.error}


@router.post("/integrations/notion/test")
async def notion_test(
    req: NotionTestRequest,
    _user: User = Depends(get_current_user),
    validators: IntegrationValidators = Depends(get_integration_validators),
) -> dict:
    """Confirm a Notion integration token actually authenticates."""
    result = await validators.validate_notion(token=req.token)
    return {"ok": result.ok, "detail": result.detail, "error": result.error}


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ProjectOut)
async def create_project(
    req: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    validators: IntegrationValidators = Depends(get_integration_validators),
) -> ProjectOut:
    """Provision a project. Google auth is required; provided Jira/Notion tokens
    are re-validated server-side (422) before anything is written."""
    pending = db.get(PendingOAuth, req.google_auth_session_id)
    if (
        pending is None
        or pending.user_id != user.id
        or pending.provider != GOOGLE_PROVIDER
        or not pending.refresh_token
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Valid Google authorization is required"
        )

    if req.jira is not None:
        result = await validators.validate_jira(
            site_url=req.jira.site_url,
            user_email=req.jira.user_email,
            api_token=req.jira.api_token,
        )
        if not result.ok:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Jira credentials did not validate: {result.error}",
            )
    if req.notion is not None:
        result = await validators.validate_notion(token=req.notion.token)
        if not result.ok:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Notion token did not validate: {result.error}",
            )

    member_ids = [uid for uid in dict.fromkeys(req.member_user_ids) if uid != user.id]
    if member_ids:
        found = {u.id for u in db.query(User).filter(User.id.in_(member_ids)).all()}
        missing = sorted(set(member_ids) - found)
        if missing:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown member(s): {missing}"
            )

    project = Project(
        owner_id=user.id,
        name=req.name,
        description=req.description,
        color=req.color,
        agent_email=pending.account_email,
        google_connected=True,
        jira_site_url=req.jira.site_url if req.jira else None,
        jira_user_email=req.jira.user_email if req.jira else None,
        jira_project_key=req.jira.project_key if req.jira else None,
        notion_section_url=req.notion.section_url if req.notion else None,
        notion_page_id=parse_notion_page_id(req.notion.section_url)
        if req.notion
        else None,
    )
    project.credential = ProjectCredential(
        google_refresh_token=pending.refresh_token,
        jira_api_token=req.jira.api_token if req.jira else None,
        notion_token=req.notion.token if req.notion else None,
    )
    project.members.append(ProjectMember(user_id=user.id, role=ProjectRole.admin))
    for uid in member_ids:
        project.members.append(ProjectMember(user_id=uid, role=ProjectRole.member))

    db.add(project)
    db.delete(pending)  # one-shot grant consumed
    db.commit()
    db.refresh(project)
    return _serialize(project, db)


@router.get("", response_model=list[ProjectOut])
def list_projects(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ProjectOut]:
    projects = (
        db.query(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == user.id)
        .order_by(Project.created_at)
        .all()
    )
    return [_serialize(p, db) for p in projects]


class CalendarAttendeeOut(BaseModel):
    email: str | None
    display_name: str | None
    response_status: str | None
    organizer: bool = False


class CalendarMeetingOut(BaseModel):
    id: str
    title: str | None
    start: str | None  # RFC 3339 dateTime, or YYYY-MM-DD for all-day events
    end: str | None
    all_day: bool
    organizer_email: str | None
    attendees: list[CalendarAttendeeOut]
    meet_link: str | None
    html_link: str | None
    status: str | None


@router.get("/{project_id}/meetings", response_model=list[CalendarMeetingOut])
async def list_project_meetings(
    project_id: str,
    days_back: int = Query(30, ge=0, le=365),
    days_forward: int = Query(60, ge=0, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    calendar: GoogleCalendarClient = Depends(get_google_calendar),
) -> list[CalendarMeetingOut]:
    """Live Google Calendar events of the project's agent account (member-only)."""
    project = db.get(Project, project_id)
    if project is None or not _is_member(db, project_id, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    refresh_token = (
        project.credential.google_refresh_token if project.credential else None
    )
    if not refresh_token:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Project has no Google authorization — reconnect the agent account",
        )

    now = datetime.now(timezone.utc)
    try:
        events = await calendar.list_events(
            refresh_token,
            time_min=now - timedelta(days=days_back),
            time_max=now + timedelta(days=days_forward),
        )
    except GoogleAuthRevokedError as exc:
        # Persist the broken grant so project listings can surface it.
        project.google_connected = False
        db.commit()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Google authorization expired or was revoked — reconnect the agent account",
        ) from exc
    except GoogleCalendarError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Could not reach Google Calendar"
        ) from exc

    return [
        _event_to_meeting(event)
        for event in events
        if event.get("status") != "cancelled"
    ]


def _event_to_meeting(event: dict) -> CalendarMeetingOut:
    start = event.get("start") or {}
    end = event.get("end") or {}
    meet_link = event.get("hangoutLink")
    if not meet_link:
        entry_points = (event.get("conferenceData") or {}).get("entryPoints") or []
        for entry in entry_points:
            if entry.get("entryPointType") == "video":
                meet_link = entry.get("uri")
                break
    return CalendarMeetingOut(
        id=event["id"],
        title=event.get("summary"),
        start=start.get("dateTime") or start.get("date"),
        end=end.get("dateTime") or end.get("date"),
        all_day="date" in start,
        organizer_email=(event.get("organizer") or {}).get("email"),
        attendees=[
            CalendarAttendeeOut(
                email=a.get("email"),
                display_name=a.get("displayName"),
                response_status=a.get("responseStatus"),
                organizer=bool(a.get("organizer")),
            )
            for a in event.get("attendees") or []
        ],
        meet_link=meet_link,
        html_link=event.get("htmlLink"),
        status=event.get("status"),
    )


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = db.get(Project, project_id)
    if project is None or not _is_member(db, project_id, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return _serialize(project, db)


def _is_member(db: Session, project_id: str, user_id: int) -> bool:
    return (
        db.get(ProjectMember, {"project_id": project_id, "user_id": user_id})
        is not None
    )


def _serialize(project: Project, db: Session) -> ProjectOut:
    members = []
    for member in project.members:
        member_user = db.get(User, member.user_id)
        members.append(
            MemberOut(
                user_id=member.user_id,
                email=member_user.email,
                name=member_user.name,
                role=member.role.value,
            )
        )
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        color=project.color,
        agent_email=project.agent_email,
        google_connected=project.google_connected,
        jira_site_url=project.jira_site_url,
        jira_user_email=project.jira_user_email,
        jira_project_key=project.jira_project_key,
        notion_section_url=project.notion_section_url,
        notion_page_id=project.notion_page_id,
        members=members,
        created_at=project.created_at,
    )


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
