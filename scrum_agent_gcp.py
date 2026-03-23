#!/usr/bin/env python3
"""
scrum_agent_gcp.py — MVP Scrum Agent, single Cloud Run service

Dependencies (requirements.txt):
    fastapi
    "uvicorn[standard]"
    sqlalchemy
    psycopg2-binary
    google-auth
    google-auth-oauthlib
    google-api-python-client
    anthropic
    httpx

Environment variables:
    DATABASE_URL            postgresql://user:pass@/dbname?host=/cloudsql/project:region:instance
    GOOGLE_CLIENT_ID        OAuth 2.0 client ID (Web application type)
    GOOGLE_CLIENT_SECRET    OAuth 2.0 client secret
    ANTHROPIC_API_KEY       Claude API key
    JIRA_BASE_URL           https://your-domain.atlassian.net  (optional)
    JIRA_EMAIL              jira user email  (optional)
    JIRA_API_TOKEN          Jira API token  (optional)
    NOTION_TOKEN            Notion integration token  (optional)
    SECRET_KEY              random secret, e.g.: openssl rand -hex 32
    BASE_URL                https://your-service-hash-uc.a.run.app

Google OAuth setup:
    - Create OAuth 2.0 Web Client in Google Cloud Console
    - Add redirect URI: {BASE_URL}/auth/callback
    - Enable APIs: Google Calendar API, Google Meet API

Deploy to Cloud Run:
    gcloud run deploy scrum-agent \\
      --source . \\
      --set-env-vars DATABASE_URL=...,GOOGLE_CLIENT_ID=...,SECRET_KEY=... \\
      --region us-central1 \\
      --min-instances 1

Calendar auto-sync via Cloud Scheduler (call every 15 min):
    gcloud scheduler jobs create http scrum-agent-sync \\
      --schedule "*/15 * * * *" \\
      --uri {BASE_URL}/api/sync-all \\
      --oidc-service-account-email ...

Note on Meet transcripts:
    Requires Google Workspace Business Plus+ with transcription enabled.
    If unavailable, status stays "pending" and transcript must be provided manually.
"""

import base64
import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import anthropic
import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy import Column, DateTime, JSON, String, Text, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# ── CONFIG ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./scrum_agent.db")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
JIRA_BASE_URL = os.environ.get("JIRA_BASE_URL", "")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")
JIRA_API_TOKEN = os.environ.get("JIRA_API_TOKEN", "")
NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/meetings.space.readonly",
]

# ── DATABASE ──────────────────────────────────────────────────────────────────

_engine_kwargs = {}
if "sqlite" in DATABASE_URL:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False)
    name = Column(String)
    google_tokens = Column(JSON)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False)
    google_event_id = Column(String, unique=True)
    meet_link = Column(String)
    meet_space_id = Column(String)
    title = Column(String)
    start_at = Column(DateTime)
    end_at = Column(DateTime)
    # pending | processing | done | error | no_transcript
    status = Column(String, default="pending")
    raw_transcript = Column(Text)
    summary = Column(Text)
    action_items = Column(JSON)   # [{text, owner, due_date}]
    decisions = Column(JSON)      # [str]
    participants = Column(JSON)   # [email]
    jira_issues = Column(JSON)    # [key]
    notion_pages = Column(JSON)   # [title]
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    processed_at = Column(DateTime)


class ProposedUpdate(Base):
    __tablename__ = "proposed_updates"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id = Column(String, nullable=False)
    target_system = Column(String)  # jira | notion
    target_id = Column(String)
    update_type = Column(String)    # comment | label
    payload = Column(JSON)          # {content: str}
    reasoning = Column(Text)
    # pending | approved | rejected | applied | error
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String)
    action = Column(String)
    payload = Column(JSON)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── SESSION (simple HMAC cookie) ──────────────────────────────────────────────

def _sign(value: str) -> str:
    sig = hmac.new(SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()
    return f"{value}.{sig}"


def _unsign(value: str) -> Optional[str]:
    if "." not in value:
        return None
    data, sig = value.rsplit(".", 1)
    expected = hmac.new(SECRET_KEY.encode(), data.encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected):
        return data
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    token = request.cookies.get("session")
    if not token:
        return None
    user_id = _unsign(token)
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ── GOOGLE OAUTH ──────────────────────────────────────────────────────────────

def _google_flow(state: Optional[str] = None) -> Flow:
    config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uris": [f"{BASE_URL}/auth/callback"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(config, scopes=GOOGLE_SCOPES, state=state)
    flow.redirect_uri = f"{BASE_URL}/auth/callback"
    return flow


def _user_creds(user: User) -> Credentials:
    t = user.google_tokens or {}
    return Credentials(
        token=t.get("access_token"),
        refresh_token=t.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    )


# ── GOOGLE CALENDAR ───────────────────────────────────────────────────────────

def sync_calendar(user: User, db: Session) -> int:
    """Pull recent/upcoming calendar events with Meet links."""
    creds = _user_creds(user)
    service = build("calendar", "v3", credentials=creds)

    now = datetime.utcnow()
    time_min = (now - timedelta(days=7)).isoformat() + "Z"
    time_max = (now + timedelta(days=1)).isoformat() + "Z"

    try:
        result = service.events().list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
            maxResults=100,
        ).execute()
    except HttpError as e:
        print(f"Calendar API error for {user.email}: {e}")
        return 0

    created = 0
    for event in result.get("items", []):
        meet_link = event.get("hangoutLink") or ""
        if not meet_link:
            # Try conferenceData
            for ep in (event.get("conferenceData") or {}).get("entryPoints", []):
                if "meet.google.com" in ep.get("uri", ""):
                    meet_link = ep["uri"]
                    break
        if not meet_link or "meet.google.com" not in meet_link:
            continue

        event_id = event["id"]
        if db.query(Meeting.id).filter(Meeting.google_event_id == event_id).first():
            continue

        start_str = event["start"].get("dateTime") or event["start"].get("date", "")
        end_str = event["end"].get("dateTime") or event["end"].get("date", "")
        space_code = meet_link.rstrip("/").split("/")[-1]

        meeting = Meeting(
            user_id=user.id,
            google_event_id=event_id,
            meet_link=meet_link,
            meet_space_id=space_code,
            title=event.get("summary", "Untitled Meeting"),
            start_at=_parse_dt(start_str),
            end_at=_parse_dt(end_str),
            participants=[a["email"] for a in event.get("attendees", []) if "email" in a],
        )
        db.add(meeting)
        created += 1

    db.commit()
    return created


def _parse_dt(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


# ── GOOGLE MEET TRANSCRIPTS ───────────────────────────────────────────────────

def fetch_meet_transcript(user: User, meeting: Meeting) -> Optional[str]:
    """
    Fetch transcript via Google Meet REST API.
    Requires Google Workspace Business Plus+ with transcription enabled.
    """
    if not meeting.meet_space_id:
        return None
    creds = _user_creds(user)
    try:
        meet_svc = build("meet", "v2", credentials=creds)
        space_name = f"spaces/{meeting.meet_space_id}"
        transcripts = meet_svc.spaces().transcripts().list(parent=space_name).execute()
        if not transcripts.get("transcripts"):
            return None
        transcript_name = transcripts["transcripts"][0]["name"]
        entries_resp = meet_svc.spaces().transcripts().entries().list(
            parent=transcript_name
        ).execute()
        entries = entries_resp.get("transcriptEntries", [])
        if not entries:
            return None
        lines = []
        for e in entries:
            speaker = e.get("participantName", "Unknown")
            text = e.get("text", "").strip()
            if text:
                lines.append(f"{speaker}: {text}")
        return "\n".join(lines) if lines else None
    except Exception as exc:
        print(f"Meet transcript error ({meeting.id}): {exc}")
        return None


# ── LLM (CLAUDE) ──────────────────────────────────────────────────────────────

_claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None


def analyze_meeting(transcript: str, title: str, participants: list) -> dict:
    """Extract structured data from transcript using Claude."""
    if not _claude:
        return {"error": "ANTHROPIC_API_KEY not configured"}

    prompt = f"""You are a Scrum assistant. Analyze this meeting transcript.

Meeting: {title}
Participants: {", ".join(participants or [])}

Transcript:
{transcript[:8000]}

Return a JSON object with these exact fields:
- "summary": string, 2-3 sentences
- "action_items": array of {{"text": str, "owner": str, "due_date": str}}
- "decisions": array of strings
- "jira_issues": array of Jira issue keys mentioned (e.g. ["PROJ-123", "TEAM-456"])
- "notion_pages": array of Notion page/doc titles mentioned
- "jira_updates": array of {{"issue_key": str, "update_type": "comment", "content": str, "reasoning": str}}
- "notion_updates": array of {{"page_title": str, "update_type": "comment", "content": str, "reasoning": str}}

Only propose updates for issues/pages explicitly discussed. Prefer a brief meeting-summary comment.
Return only valid JSON, no markdown fences."""

    try:
        resp = _claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except Exception as exc:
        print(f"LLM analysis error: {exc}")
        return {"error": str(exc)}


def chat_with_meetings(question: str, meetings: list[dict]) -> str:
    """Answer a question using recent meeting data as context."""
    if not _claude:
        return "LLM not configured (set ANTHROPIC_API_KEY)."

    context_parts = []
    for m in meetings[:8]:
        part = f"## {m['title']} — {m.get('start_at', '')}\n"
        if m.get("summary"):
            part += f"Summary: {m['summary']}\n"
        if m.get("action_items"):
            part += f"Action items: {json.dumps(m['action_items'], ensure_ascii=False)}\n"
        if m.get("decisions"):
            part += f"Decisions: {json.dumps(m['decisions'], ensure_ascii=False)}\n"
        if m.get("raw_transcript"):
            part += f"Transcript:\n{m['raw_transcript'][:1500]}\n"
        context_parts.append(part)

    context = "\n\n".join(context_parts)
    try:
        resp = _claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": f"Based on these meeting records, answer concisely.\n\n{context}\n\nQuestion: {question}",
            }],
        )
        return resp.content[0].text
    except Exception as exc:
        return f"Error: {exc}"


# ── JIRA ADAPTER ──────────────────────────────────────────────────────────────

def _jira_headers() -> dict:
    token = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_API_TOKEN}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json", "Accept": "application/json"}


def jira_add_comment(issue_key: str, comment: str) -> bool:
    if not JIRA_BASE_URL:
        return False
    try:
        r = httpx.post(
            f"{JIRA_BASE_URL}/rest/api/3/issue/{issue_key}/comment",
            headers=_jira_headers(),
            json={"body": {
                "version": 1, "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": comment}]}],
            }},
            timeout=15,
        )
        return r.status_code == 201
    except Exception as exc:
        print(f"Jira comment error ({issue_key}): {exc}")
        return False


def jira_add_label(issue_key: str, label: str) -> bool:
    if not JIRA_BASE_URL:
        return False
    try:
        r = httpx.get(
            f"{JIRA_BASE_URL}/rest/api/3/issue/{issue_key}?fields=labels",
            headers=_jira_headers(), timeout=10,
        )
        current = [l["name"] for l in r.json().get("fields", {}).get("labels", [])]
        if label in current:
            return True
        r2 = httpx.put(
            f"{JIRA_BASE_URL}/rest/api/3/issue/{issue_key}",
            headers=_jira_headers(),
            json={"fields": {"labels": current + [label]}},
            timeout=10,
        )
        return r2.status_code == 204
    except Exception as exc:
        print(f"Jira label error ({issue_key}): {exc}")
        return False


# ── NOTION ADAPTER ────────────────────────────────────────────────────────────

def _notion_headers() -> dict:
    return {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }


def notion_find_page(title: str) -> Optional[str]:
    """Search Notion by title, return page_id or None."""
    if not NOTION_TOKEN:
        return None
    try:
        r = httpx.post(
            "https://api.notion.com/v1/search",
            headers=_notion_headers(),
            json={"query": title, "filter": {"property": "object", "value": "page"}, "page_size": 1},
            timeout=10,
        )
        results = r.json().get("results", [])
        return results[0]["id"] if results else None
    except Exception as exc:
        print(f"Notion search error: {exc}")
        return None


def notion_add_comment(page_id: str, comment: str) -> bool:
    if not NOTION_TOKEN:
        return False
    try:
        r = httpx.post(
            "https://api.notion.com/v1/comments",
            headers=_notion_headers(),
            json={
                "parent": {"page_id": page_id},
                "rich_text": [{"text": {"content": comment[:2000]}}],
            },
            timeout=10,
        )
        return r.status_code == 200
    except Exception as exc:
        print(f"Notion comment error: {exc}")
        return False


# ── PROCESSING PIPELINE ───────────────────────────────────────────────────────

def process_meeting(meeting_id: str) -> None:
    """Full pipeline: fetch transcript → analyze → store results → create proposals."""
    db = SessionLocal()
    meeting = None
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            return

        meeting.status = "processing"
        db.commit()

        user = db.query(User).filter(User.id == meeting.user_id).first()
        if not user:
            meeting.status = "error"
            db.commit()
            return

        # 1. Fetch transcript
        transcript = fetch_meet_transcript(user, meeting)
        if not transcript:
            meeting.status = "no_transcript"
            db.commit()
            return

        meeting.raw_transcript = transcript
        db.commit()

        # 2. Analyze
        analysis = analyze_meeting(
            transcript=transcript,
            title=meeting.title or "",
            participants=meeting.participants or [],
        )
        if "error" in analysis:
            meeting.status = "error"
            db.commit()
            return

        # 3. Store
        meeting.summary = analysis.get("summary", "")
        meeting.action_items = analysis.get("action_items", [])
        meeting.decisions = analysis.get("decisions", [])
        meeting.jira_issues = analysis.get("jira_issues", [])
        meeting.notion_pages = analysis.get("notion_pages", [])
        meeting.status = "done"
        meeting.processed_at = datetime.now(timezone.utc)
        db.commit()

        # 4. Create proposed updates for Jira
        for upd in analysis.get("jira_updates", []):
            if not upd.get("issue_key"):
                continue
            db.add(ProposedUpdate(
                meeting_id=meeting.id,
                target_system="jira",
                target_id=upd["issue_key"],
                update_type=upd.get("update_type", "comment"),
                payload={"content": upd.get("content", "")},
                reasoning=upd.get("reasoning", ""),
            ))

        # 5. Create proposed updates for Notion
        for upd in analysis.get("notion_updates", []):
            page_title = upd.get("page_title", "")
            if not page_title:
                continue
            page_id = notion_find_page(page_title) or page_title
            db.add(ProposedUpdate(
                meeting_id=meeting.id,
                target_system="notion",
                target_id=page_id,
                update_type=upd.get("update_type", "comment"),
                payload={"content": upd.get("content", "")},
                reasoning=upd.get("reasoning", ""),
            ))

        db.commit()

    except Exception as exc:
        print(f"process_meeting error ({meeting_id}): {exc}")
        if meeting:
            meeting.status = "error"
            db.commit()
    finally:
        db.close()


# ── APP ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Scrum Agent MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── HEALTH ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


# ── AUTH ──────────────────────────────────────────────────────────────────────

@app.get("/auth/login")
def login():
    flow = _google_flow()
    auth_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    resp = RedirectResponse(auth_url)
    resp.set_cookie("oauth_state", state, httponly=True, max_age=600, samesite="lax")
    return resp


@app.get("/auth/callback")
def auth_callback(
    request: Request,
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    saved_state = request.cookies.get("oauth_state")
    if not saved_state or saved_state != state:
        raise HTTPException(400, "Invalid OAuth state")

    flow = _google_flow(state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials

    user_info_svc = build("oauth2", "v2", credentials=creds)
    user_info = user_info_svc.userinfo().get().execute()
    email = user_info["email"]

    tokens = {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
    }

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, name=user_info.get("name"), google_tokens=tokens)
        db.add(user)
    else:
        user.google_tokens = tokens
        user.name = user_info.get("name")
    db.commit()

    resp = RedirectResponse("/")
    resp.set_cookie("session", _sign(user.id), httponly=True, max_age=86400 * 30, samesite="lax")
    resp.delete_cookie("oauth_state")
    return resp


@app.get("/auth/logout")
def logout():
    resp = RedirectResponse("/")
    resp.delete_cookie("session")
    return resp


# ── API ───────────────────────────────────────────────────────────────────────

@app.get("/api/me")
def me(user: User = Depends(require_user)):
    return {"id": user.id, "email": user.email, "name": user.name}


@app.post("/api/sync")
def sync(
    bg: BackgroundTasks,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Sync calendar for current user. Can be called by Cloud Scheduler."""
    count = sync_calendar(user, db)
    return {"synced": count}


@app.post("/api/sync-all")
def sync_all(db: Session = Depends(get_db)):
    """Sync calendar for all users. Intended for Cloud Scheduler (no auth required)."""
    users = db.query(User).all()
    total = 0
    for u in users:
        total += sync_calendar(u, db)
    return {"synced": total, "users": len(users)}


@app.get("/api/meetings")
def list_meetings(
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    meetings = (
        db.query(Meeting)
        .filter(Meeting.user_id == user.id)
        .order_by(Meeting.start_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": m.id,
            "title": m.title,
            "status": m.status,
            "start_at": m.start_at,
            "end_at": m.end_at,
            "summary": m.summary,
            "action_items_count": len(m.action_items or []),
        }
        for m in meetings
    ]


@app.get("/api/meetings/{meeting_id}")
def get_meeting(
    meeting_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not m:
        raise HTTPException(404)
    return {
        "id": m.id,
        "title": m.title,
        "status": m.status,
        "start_at": m.start_at,
        "end_at": m.end_at,
        "meet_link": m.meet_link,
        "participants": m.participants,
        "raw_transcript": m.raw_transcript,
        "summary": m.summary,
        "action_items": m.action_items,
        "decisions": m.decisions,
        "jira_issues": m.jira_issues,
        "notion_pages": m.notion_pages,
        "processed_at": m.processed_at,
    }


@app.post("/api/meetings/{meeting_id}/process")
def trigger_process(
    meeting_id: str,
    bg: BackgroundTasks,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not m:
        raise HTTPException(404)
    if m.status == "processing":
        raise HTTPException(400, "Already processing")
    m.status = "processing"
    db.commit()
    bg.add_task(process_meeting, meeting_id)
    return {"status": "queued"}


@app.post("/api/meetings/{meeting_id}/transcript")
async def upload_transcript(
    meeting_id: str,
    request: Request,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Manual transcript upload for meetings without native Meet transcripts."""
    m = db.query(Meeting).filter(Meeting.id == meeting_id, Meeting.user_id == user.id).first()
    if not m:
        raise HTTPException(404)
    body = await request.json()
    transcript = body.get("transcript", "").strip()
    if not transcript:
        raise HTTPException(400, "transcript required")
    m.raw_transcript = transcript
    m.status = "pending"
    db.commit()
    return {"ok": True}


@app.get("/api/updates")
def list_updates(
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    meeting_ids = [
        row[0]
        for row in db.query(Meeting.id).filter(Meeting.user_id == user.id).all()
    ]
    updates = (
        db.query(ProposedUpdate)
        .filter(
            ProposedUpdate.meeting_id.in_(meeting_ids),
            ProposedUpdate.status == "pending",
        )
        .order_by(ProposedUpdate.created_at.desc())
        .all()
    )
    return [
        {
            "id": u.id,
            "meeting_id": u.meeting_id,
            "target_system": u.target_system,
            "target_id": u.target_id,
            "update_type": u.update_type,
            "payload": u.payload,
            "reasoning": u.reasoning,
            "status": u.status,
        }
        for u in updates
    ]


@app.post("/api/updates/{update_id}/approve")
def approve_update(
    update_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    upd = db.query(ProposedUpdate).filter(ProposedUpdate.id == update_id).first()
    if not upd:
        raise HTTPException(404)
    meeting = db.query(Meeting).filter(
        Meeting.id == upd.meeting_id, Meeting.user_id == user.id
    ).first()
    if not meeting:
        raise HTTPException(403)

    content = (upd.payload or {}).get("content", "")
    success = False

    if upd.target_system == "jira":
        if upd.update_type == "comment":
            success = jira_add_comment(upd.target_id, content)
        elif upd.update_type == "label":
            success = jira_add_label(upd.target_id, content)
    elif upd.target_system == "notion":
        success = notion_add_comment(upd.target_id, content)

    upd.status = "applied" if success else "error"
    db.add(AuditLog(
        user_id=user.id,
        action="approve_update",
        payload={"update_id": update_id, "success": success},
    ))
    db.commit()
    return {"success": success}


@app.post("/api/updates/{update_id}/reject")
def reject_update(
    update_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    upd = db.query(ProposedUpdate).filter(ProposedUpdate.id == update_id).first()
    if not upd:
        raise HTTPException(404)
    upd.status = "rejected"
    db.commit()
    return {"ok": True}


@app.post("/api/chat")
async def chat(
    request: Request,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    body = await request.json()
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(400, "question required")

    meetings = (
        db.query(Meeting)
        .filter(Meeting.user_id == user.id, Meeting.status == "done")
        .order_by(Meeting.start_at.desc())
        .limit(10)
        .all()
    )
    meetings_data = [
        {
            "title": m.title,
            "start_at": str(m.start_at),
            "summary": m.summary,
            "action_items": m.action_items,
            "decisions": m.decisions,
            "raw_transcript": m.raw_transcript,
        }
        for m in meetings
    ]
    answer = chat_with_meetings(question, meetings_data)
    return {"answer": answer}


# ── FRONTEND (single-page HTML, served inline) ────────────────────────────────

_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scrum Agent</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f0f2f5;color:#1a1a2e}
.nav{background:#1a73e8;color:#fff;padding:12px 24px;display:flex;justify-content:space-between;align-items:center}
.nav a{color:#fff;text-decoration:none;opacity:.9}
.nav a:hover{opacity:1}
.wrap{max-width:960px;margin:24px auto;padding:0 16px}
.card{background:#fff;border-radius:10px;padding:20px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.btn{background:#1a73e8;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500}
.btn:hover{background:#1557b0}.btn-sm{padding:4px 12px;font-size:13px}
.btn-ok{background:#188038}.btn-ok:hover{background:#0f5c2e}
.btn-no{background:#c62828}.btn-no:hover{background:#8e0000}
.btn-ghost{background:none;color:#1a73e8;border:1px solid #1a73e8}
.tabs{display:flex;gap:6px;margin-bottom:20px}
.tab{padding:8px 18px;border-radius:20px;cursor:pointer;border:1px solid #ddd;background:#fff;font-size:14px}
.tab.on{background:#1a73e8;color:#fff;border-color:#1a73e8}
.sec{display:none}.sec.on{display:block}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:500}
.b-done{background:#e6f4ea;color:#137333}
.b-pending{background:#fff8e1;color:#f57c00}
.b-processing{background:#e8f0fe;color:#1557b0}
.b-error,.b-no_transcript{background:#fce8e6;color:#c62828}
.chat-box{height:280px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:8px;background:#fafafa}
.msg{margin-bottom:10px}.msg.u{text-align:right}
.bubble{display:inline-block;padding:7px 13px;border-radius:14px;max-width:78%;font-size:14px;line-height:1.4}
.msg.u .bubble{background:#1a73e8;color:#fff}
.msg.b .bubble{background:#e8eaed}
input,textarea{width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px}
input:focus,textarea:focus{outline:none;border-color:#1a73e8}
.row{display:flex;gap:8px;align-items:center}
.muted{color:#666;font-size:13px}
.back{color:#1a73e8;cursor:pointer;margin-bottom:12px;display:inline-block;font-size:14px}
pre{white-space:pre-wrap;font-size:13px;line-height:1.5;font-family:inherit}
h3{font-size:16px;font-weight:600}
ul{padding-left:20px}li{margin-bottom:4px;font-size:14px}
.detail-hidden{display:none}
.empty{text-align:center;color:#888;padding:32px;font-size:14px}
</style>
</head>
<body>
<nav class="nav">
  <strong>Scrum Agent</strong>
  <div id="nav-user"><a href="/auth/login">Sign in with Google</a></div>
</nav>

<div class="wrap" id="app">

  <!-- Logged out -->
  <div id="view-out" style="display:none">
    <div class="card" style="text-align:center;padding:48px">
      <h2 style="margin-bottom:12px">Scrum Agent MVP</h2>
      <p class="muted" style="margin-bottom:24px">Connect Google Calendar · Analyze meetings · Sync Jira & Notion</p>
      <a href="/auth/login" class="btn">Sign in with Google</a>
    </div>
  </div>

  <!-- Main -->
  <div id="view-main" style="display:none">
    <div class="tabs">
      <div class="tab on" onclick="tab('meetings')">Meetings</div>
      <div class="tab"    onclick="tab('updates')">Updates</div>
      <div class="tab"    onclick="tab('chat')">Chat</div>
    </div>

    <!-- Meetings tab -->
    <div id="sec-meetings" class="sec on">
      <div class="row" style="margin-bottom:12px;justify-content:space-between">
        <h3>Your Meetings</h3>
        <button class="btn btn-sm" onclick="doSync()">Sync Calendar</button>
      </div>
      <div id="meetings-list"></div>
    </div>

    <!-- Updates tab -->
    <div id="sec-updates" class="sec">
      <h3 style="margin-bottom:12px">Pending Updates</h3>
      <div id="updates-list"></div>
    </div>

    <!-- Chat tab -->
    <div id="sec-chat" class="sec">
      <div class="card">
        <h3 style="margin-bottom:12px">Ask about your meetings</h3>
        <div class="chat-box" id="chat-box"></div>
        <div class="row">
          <input id="chat-input" placeholder="e.g. What did we decide about the API refactor?" onkeydown="if(event.key==='Enter'&&!event.shiftKey)sendChat()">
          <button class="btn" onclick="sendChat()">Send</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Meeting detail -->
  <div id="view-detail" style="display:none">
    <span class="back" onclick="backToList()">← Meetings</span>
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:start">
        <div>
          <h2 id="d-title" style="font-size:18px"></h2>
          <p class="muted" id="d-meta" style="margin-top:4px"></p>
        </div>
        <span class="badge" id="d-status"></span>
      </div>
      <div class="row" style="margin-top:14px;gap:8px">
        <button class="btn btn-sm" id="d-process-btn" onclick="processNow()">Process Meeting</button>
        <button class="btn btn-sm btn-ghost" id="d-reprocess-btn" onclick="processNow()" style="display:none">Re-process</button>
      </div>
    </div>
    <div id="d-content"></div>
    <div id="d-transcript-wrap" class="detail-hidden">
      <div class="card">
        <details>
          <summary style="cursor:pointer;font-weight:600;font-size:15px">Full Transcript</summary>
          <pre id="d-transcript" style="margin-top:10px;max-height:400px;overflow-y:auto"></pre>
        </details>
      </div>
    </div>
    <div id="d-upload-wrap" class="detail-hidden">
      <div class="card">
        <h3 style="margin-bottom:10px">Upload Transcript Manually</h3>
        <p class="muted" style="margin-bottom:10px">Google Meet transcript not available. Paste the text below.</p>
        <textarea id="d-transcript-input" rows="6" placeholder="Speaker A: Hello...&#10;Speaker B: Hi..."></textarea>
        <div style="margin-top:10px">
          <button class="btn btn-sm" onclick="uploadTranscript()">Save & Process</button>
        </div>
      </div>
    </div>
  </div>

</div>

<script>
let me = null;
let currentMeetingId = null;

const $ = id => document.getElementById(id);

async function api(url, opts = {}) {
  const r = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  return r.json();
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function init() {
  try {
    me = await api('/api/me');
    $('nav-user').innerHTML = `<span style="opacity:.9">${esc(me.name || me.email)}</span> <a href="/auth/logout" style="margin-left:14px">Logout</a>`;
    $('view-main').style.display = 'block';
    loadMeetings();
  } catch {
    $('view-out').style.display = 'block';
  }
}

function tab(name) {
  ['meetings','updates','chat'].forEach((n, i) => {
    document.querySelectorAll('.tab')[i].classList.toggle('on', n === name);
    $('sec-' + n).classList.toggle('on', n === name);
  });
  if (name === 'updates') loadUpdates();
}

async function doSync() {
  try {
    const r = await api('/api/sync', { method: 'POST' });
    alert(`Synced ${r.synced} new meeting(s)`);
    loadMeetings();
  } catch(e) { alert('Sync error: ' + e.message); }
}

async function loadMeetings() {
  const meetings = await api('/api/meetings');
  const el = $('meetings-list');
  if (!meetings.length) {
    el.innerHTML = '<div class="card empty">No meetings yet — click Sync Calendar</div>';
    return;
  }
  el.innerHTML = meetings.map(m => `
    <div class="card" style="cursor:pointer" onclick="openMeeting('${m.id}')">
      <div class="row" style="justify-content:space-between">
        <strong>${esc(m.title)}</strong>
        <span class="badge b-${m.status}">${m.status}</span>
      </div>
      <p class="muted" style="margin-top:4px">${m.start_at ? new Date(m.start_at).toLocaleString() : '—'}</p>
      ${m.summary ? `<p style="margin-top:8px;font-size:14px">${esc(m.summary)}</p>` : ''}
      ${m.action_items_count ? `<p class="muted" style="margin-top:4px">${m.action_items_count} action item(s)</p>` : ''}
    </div>
  `).join('');
}

async function openMeeting(id) {
  currentMeetingId = id;
  const m = await api('/api/meetings/' + id);
  $('view-main').style.display = 'none';
  $('view-detail').style.display = 'block';

  $('d-title').textContent = m.title;
  $('d-meta').textContent = [
    m.start_at ? new Date(m.start_at).toLocaleString() : '',
    (m.participants || []).join(', ')
  ].filter(Boolean).join(' · ');

  const statusEl = $('d-status');
  statusEl.textContent = m.status;
  statusEl.className = 'badge b-' + m.status;

  $('d-process-btn').style.display = ['done','processing'].includes(m.status) ? 'none' : '';
  $('d-reprocess-btn').style.display = m.status === 'done' ? '' : 'none';

  let html = '';
  if (m.summary) {
    html += `<div class="card"><h3 style="margin-bottom:8px">Summary</h3><p style="font-size:14px;line-height:1.6">${esc(m.summary)}</p></div>`;
  }
  if (m.action_items?.length) {
    html += `<div class="card"><h3 style="margin-bottom:8px">Action Items</h3><ul>${
      m.action_items.map(a => {
        const t = typeof a === 'string' ? a : (a.owner ? `<strong>${esc(a.owner)}</strong>: ${esc(a.text)}` + (a.due_date ? ` (${esc(a.due_date)})` : '') : esc(a.text));
        return `<li>${t}</li>`;
      }).join('')
    }</ul></div>`;
  }
  if (m.decisions?.length) {
    html += `<div class="card"><h3 style="margin-bottom:8px">Decisions</h3><ul>${m.decisions.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>`;
  }
  if (m.jira_issues?.length) {
    html += `<div class="card"><h3 style="margin-bottom:8px">Jira Issues Mentioned</h3><p class="muted">${m.jira_issues.join(', ')}</p></div>`;
  }
  $('d-content').innerHTML = html;

  if (m.raw_transcript) {
    $('d-transcript').textContent = m.raw_transcript;
    $('d-transcript-wrap').style.display = '';
    $('d-upload-wrap').style.display = 'none';
  } else if (m.status === 'no_transcript') {
    $('d-transcript-wrap').style.display = 'none';
    $('d-upload-wrap').style.display = '';
  } else {
    $('d-transcript-wrap').style.display = 'none';
    $('d-upload-wrap').style.display = 'none';
  }
}

function backToList() {
  $('view-detail').style.display = 'none';
  $('view-main').style.display = 'block';
  loadMeetings();
}

async function processNow() {
  if (!currentMeetingId) return;
  try {
    await api('/api/meetings/' + currentMeetingId + '/process', { method: 'POST' });
    alert('Processing started. Reload in ~30 seconds.');
    openMeeting(currentMeetingId);
  } catch(e) { alert('Error: ' + e.message); }
}

async function uploadTranscript() {
  const text = $('d-transcript-input').value.trim();
  if (!text) return;
  try {
    await api('/api/meetings/' + currentMeetingId + '/transcript', {
      method: 'POST',
      body: JSON.stringify({ transcript: text }),
    });
    await api('/api/meetings/' + currentMeetingId + '/process', { method: 'POST' });
    alert('Saved and processing started.');
    openMeeting(currentMeetingId);
  } catch(e) { alert('Error: ' + e.message); }
}

async function loadUpdates() {
  const updates = await api('/api/updates');
  const el = $('updates-list');
  if (!updates.length) {
    el.innerHTML = '<div class="card empty">No pending updates</div>';
    return;
  }
  el.innerHTML = updates.map(u => `
    <div class="card">
      <div class="row" style="align-items:start;gap:12px">
        <div style="flex:1">
          <div class="row" style="gap:8px;margin-bottom:6px">
            <strong>${esc(u.target_system.toUpperCase())}: ${esc(u.target_id)}</strong>
            <span class="muted">${u.update_type}</span>
          </div>
          <p style="font-size:14px;line-height:1.5">${esc((u.payload || {}).content || '')}</p>
          ${u.reasoning ? `<p class="muted" style="margin-top:6px;font-style:italic">${esc(u.reasoning)}</p>` : ''}
        </div>
        <div class="row" style="gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-ok" onclick="doApprove('${u.id}')">Apply</button>
          <button class="btn btn-sm btn-no" onclick="doReject('${u.id}')">Reject</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function doApprove(id) {
  try {
    const r = await api('/api/updates/' + id + '/approve', { method: 'POST' });
    r.success ? alert('Applied!') : alert('Apply failed — check Jira/Notion credentials.');
    loadUpdates();
  } catch(e) { alert('Error: ' + e.message); }
}

async function doReject(id) {
  await api('/api/updates/' + id + '/reject', { method: 'POST' });
  loadUpdates();
}

async function sendChat() {
  const input = $('chat-input');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  const box = $('chat-box');
  box.innerHTML += `<div class="msg u"><div class="bubble">${esc(q)}</div></div>`;
  box.scrollTop = box.scrollHeight;
  try {
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ question: q }) });
    box.innerHTML += `<div class="msg b"><div class="bubble">${esc(r.answer).replace(/\n/g,'<br>')}</div></div>`;
  } catch(e) {
    box.innerHTML += `<div class="msg b"><div class="bubble" style="color:#c62828">Error: ${esc(e.message)}</div></div>`;
  }
  box.scrollTop = box.scrollHeight;
}

init();
</script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def index():
    return _HTML


# ── ENTRYPOINT ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
