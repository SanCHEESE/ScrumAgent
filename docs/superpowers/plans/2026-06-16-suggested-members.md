# Suggested members + batch-add + editable roles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Suggested members" section to Settings → Members that surfaces the project agent's meeting participants, lets an operator multi-select and batch-add them, and edit roles in "Team members"; people without an account are persisted as email invitations and become real members on first Google login.

**Architecture:** New `PendingProjectMember(project_id, email, role)` table (parallel to `ProjectMember`, which keeps its `(project_id, user_id)` PK). `ProjectOut` gains an additive `pending_members` list. Four new endpoints on the projects router (all under `require_project_access`): list suggestions, batch add, patch member role, patch pending-member role. A new `app/membership.py` helper reconciles invitations to memberships inside the Google login callback, on every login (idempotent). Frontend rewrites `MembersSection.tsx` (read-only → editable + suggestions) and adds four `lib/api.ts` methods.

**Tech Stack:** Backend FastAPI + SQLAlchemy 2.0 (sync, SQLite in tests via `create_all`, no Alembic), pytest + `TestClient`. Frontend Next.js 14 + React, plain `fetch` client, TypeScript (`tsc --noEmit`), no FE unit runner (verify in preview browser).

**Spec:** `docs/superpowers/specs/2026-06-16-suggested-members-design.md` · **bd:** `ScrumAgent-idt`

**Conventions to follow:**
- Backend test commands assume the project venv: run from `backend/` as `.venv/bin/pytest …`.
- Frontend typecheck: `npm --prefix apps/web run typecheck`.
- Reuse the existing `MeetingParticipantSuggestionOut` (backend) / `MeetingParticipantSuggestion` (frontend) for suggestions — it already has exactly `{email, display_name, event_count}`. (Spec mentioned a `MemberSuggestionOut`; reuse the existing type instead — DRY.)
- Commit after each task. Reference `ScrumAgent-idt` in messages.

---

## Task 1: `PendingProjectMember` model

**Files:**
- Modify: `backend/app/models/project.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_models_pending_member.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_models_pending_member.py`:

```python
"""PendingProjectMember model (ScrumAgent-idt).

An email invitation to a project, keyed by (project_id, email), cascade-deleted
with its project. Realized into a ProjectMember on the invitee's first login.
"""
from __future__ import annotations

from app.models import (
    PendingProjectMember,
    Project,
    ProjectMember,
    User,
)
from app.models.types import ProjectRole


def _project(db) -> Project:
    owner = User(google_sub="sub-owner", email="owner@municorn.com", name="Owner")
    db.add(owner)
    db.commit()
    db.refresh(owner)
    project = Project(
        owner_id=owner.id, name="P", agent_email="agent@municorn.com"
    )
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def test_pending_member_persists_and_reads_back(db_session):
    project = _project(db_session)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="invitee@municorn.com", role=ProjectRole.viewer
        )
    )
    db_session.commit()

    row = db_session.get(
        PendingProjectMember,
        {"project_id": project.id, "email": "invitee@municorn.com"},
    )
    assert row is not None
    assert row.role is ProjectRole.viewer
    assert row.created_at is not None  # TimestampMixin


def test_pending_members_accessible_via_relationship(db_session):
    project = _project(db_session)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="a@municorn.com", role=ProjectRole.member
        )
    )
    db_session.commit()
    db_session.refresh(project)
    assert [p.email for p in project.pending_members] == ["a@municorn.com"]


def test_pending_members_cascade_delete_with_project(db_session):
    project = _project(db_session)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="a@municorn.com", role=ProjectRole.member
        )
    )
    db_session.commit()

    db_session.delete(project)
    db_session.commit()
    assert db_session.query(PendingProjectMember).count() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_models_pending_member.py -q`
Expected: FAIL — `ImportError: cannot import name 'PendingProjectMember'`.

- [ ] **Step 3: Add the model**

In `backend/app/models/project.py`, add this class immediately after `ProjectMember` (after line 88, before `ProjectCredential`):

```python
class PendingProjectMember(TimestampMixin, Base):
    """Email invitation to a project, realized as a ProjectMember on the
    invitee's first Google login (see ``app.membership.grant_pending_memberships``).

    Keyed by ``(project_id, email)`` so a person can't be invited to the same
    project twice; ``email`` is stored lower-cased by the callers that write it.
    """

    __tablename__ = "pending_project_members"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), primary_key=True
    )
    email: Mapped[str] = mapped_column(String(320), primary_key=True)
    role: Mapped[ProjectRole] = mapped_column(
        SAEnum(ProjectRole, native_enum=False),
        default=ProjectRole.member,
        nullable=False,
    )

    project: Mapped["Project"] = relationship(back_populates="pending_members")
```

In the same file, add the back-reference to `Project` — inside `class Project`, right after the `members` relationship (after line 66):

```python
    pending_members: Mapped[list["PendingProjectMember"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
```

- [ ] **Step 4: Register the model**

In `backend/app/models/__init__.py`, add `PendingProjectMember` to both the `from app.models.project import (...)` block and `__all__`:

```python
from app.models.project import (
    PendingOAuth,
    PendingProjectMember,
    Project,
    ProjectAgentSettings,
    ProjectCredential,
    ProjectMember,
)
```

and in `__all__` add the string `"PendingProjectMember",` (next to `"ProjectMember"`).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_models_pending_member.py -q`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
rtk git add backend/app/models/project.py backend/app/models/__init__.py backend/tests/test_models_pending_member.py
rtk git commit -m "feat(members): PendingProjectMember model (ScrumAgent-idt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `pending_members` in `ProjectOut` + `_serialize`

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_project_members_api.py` (create — shared by Tasks 2–5)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_project_members_api.py` with this shared harness + the first test:

```python
"""Settings → Members backend endpoints (ScrumAgent-idt).

Covers ProjectOut.pending_members serialization, batch add (existing user →
member, unknown email → invitation), role PATCH for both kinds, and the live
member-suggestions endpoint. Faked GoogleCalendarClient — no network.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.google_calendar import GoogleCalendarError
from app.main import app
from app.models import (
    PendingProjectMember,
    Project,
    ProjectCredential,
    ProjectMember,
    User,
)
from app.models.types import ProjectRole
from app.security import create_access_token

SECRET = "router-test-secret"


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        secret_key=SECRET,
        openai_api_key="k",
        google_client_id="cid",
        google_client_secret="csec",
        backend_base_url="http://testserver",
        frontend_base_url="http://localhost:3000",
        allowed_domain="municorn.com",
    )


class FakeCalendar:
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.error: Exception | None = None

    async def list_events(self, refresh_token, *, time_min, time_max, max_results=250):
        if self.error is not None:
            raise self.error
        return list(self.events)


@pytest.fixture
def fake_calendar() -> FakeCalendar:
    return FakeCalendar()


@pytest.fixture
def client(db_session, fake_calendar):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_google_calendar] = lambda: fake_calendar
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


def _auth(uid: int) -> dict:
    token = create_access_token(str(uid), SECRET, extra={"env": "production"})
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, email, sub) -> User:
    user = User(google_sub=sub, email=email, name=email.split("@")[0].title())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_project(db, owner, *, refresh_token="1//rt") -> Project:
    project = Project(
        owner_id=owner.id,
        name="Telecom",
        agent_email="agent@municorn.com",
        google_connected=True,
    )
    project.credential = ProjectCredential(google_refresh_token=refresh_token)
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


# --- Task 2: serialization ---

def test_project_out_includes_empty_pending_members(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.get(f"/projects/{project.id}", headers=_auth(owner.id))
    assert resp.status_code == 200
    assert resp.json()["pending_members"] == []


def test_project_out_serializes_pending_members(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="bob@municorn.com", role=ProjectRole.viewer
        )
    )
    db_session.commit()
    resp = client.get(f"/projects/{project.id}", headers=_auth(owner.id))
    assert resp.status_code == 200
    assert resp.json()["pending_members"] == [
        {"email": "bob@municorn.com", "role": "viewer"}
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_project_members_api.py -q`
Expected: FAIL — `KeyError: 'pending_members'` (field not in response).

- [ ] **Step 3: Add `PendingMemberOut`, extend `ProjectOut`, update `_serialize`**

In `backend/app/routers/projects.py`:

(a) Import `PendingProjectMember` — extend the existing `from app.models import (...)` block (lines 39–47) to include it:

```python
from app.models import (
    LlmUsage,
    PendingOAuth,
    PendingProjectMember,
    Project,
    ProjectAgentSettings,
    ProjectCredential,
    ProjectMember,
    User,
)
```

(b) Add `func` to the SQLAlchemy import. At the top with the other imports (after line 21, `from sqlalchemy.orm import Session`), add:

```python
from sqlalchemy import func
```

(c) Add `PendingMemberOut` and the `ProjectOut` field. Replace the `MemberOut` + `ProjectOut` class block (lines 138–158) with:

```python
class MemberOut(BaseModel):
    user_id: int
    email: str
    name: str | None
    role: str


class PendingMemberOut(BaseModel):
    email: str
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
    pending_members: list[PendingMemberOut]
    created_at: datetime
```

(d) Populate it in `_serialize` (lines 970–1000). After the `members` loop, before the `return ProjectOut(...)`, add the pending list, and add the field to the constructor:

```python
def _serialize(project: Project, db: Session) -> ProjectOut:
    members = []
    for member in project.members:
        member_user = db.get(User, member.user_id)
        if member_user is None:
            # Orphaned membership (user_id points at a deleted/missing User).
            # Skip it so serialization can't 500 the whole response.
            continue
        members.append(
            MemberOut(
                user_id=member.user_id,
                email=member_user.email,
                name=member_user.name,
                role=member.role.value,
            )
        )
    pending_members = [
        PendingMemberOut(email=p.email, role=p.role.value)
        for p in project.pending_members
    ]
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
        pending_members=pending_members,
        created_at=project.created_at,
    )
```

- [ ] **Step 4: Run the new test AND the full suite (the field is additive — confirm nothing else breaks)**

Run: `cd backend && .venv/bin/pytest tests/test_project_members_api.py -q && .venv/bin/pytest -q`
Expected: new file PASS; full suite PASS (no regression — existing project tests assert on `members`, never the exact key-set).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/routers/projects.py backend/tests/test_project_members_api.py
rtk git commit -m "feat(members): pending_members in ProjectOut (ScrumAgent-idt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `POST /{project_id}/members` — batch add

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_project_members_api.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_project_members_api.py`:

```python
# --- Task 3: POST /{id}/members batch add ---

def test_add_members_requires_auth(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.post(
        f"/projects/{project.id}/members",
        json={"members": [{"email": "x@municorn.com", "role": "member"}]},
    )
    assert resp.status_code == 401


def test_add_members_404_for_non_member(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    outsider = _make_user(db_session, "bob@municorn.com", "sub-b")
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(outsider.id),
        json={"members": [{"email": "x@municorn.com", "role": "member"}]},
    )
    assert resp.status_code == 404


def test_add_existing_user_becomes_member(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    bob = _make_user(db_session, "bob@municorn.com", "sub-b")
    project = _make_project(db_session, owner)
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "BOB@municorn.com", "role": "viewer"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    bob_rows = [m for m in body["members"] if m["user_id"] == bob.id]
    assert bob_rows == [
        {"user_id": bob.id, "email": "bob@municorn.com", "name": "Bob", "role": "viewer"}
    ]
    assert body["pending_members"] == []


def test_add_unknown_email_becomes_pending(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "Carol@municorn.com", "role": "member"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["pending_members"] == [
        {"email": "carol@municorn.com", "role": "member"}
    ]
    # No new registered member beyond the owner.
    assert {m["email"] for m in body["members"]} == {"alice@municorn.com"}


def test_add_members_is_idempotent_for_existing_member(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    bob = _make_user(db_session, "bob@municorn.com", "sub-b")
    project = _make_project(db_session, owner)
    payload = {"members": [{"email": "bob@municorn.com", "role": "admin"}]}
    client.post(f"/projects/{project.id}/members", headers=_auth(owner.id), json=payload)
    # Re-add with a different role: existing membership is left untouched.
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "bob@municorn.com", "role": "viewer"}]},
    )
    assert resp.status_code == 200
    bob_rows = [m for m in resp.json()["members"] if m["user_id"] == bob.id]
    assert len(bob_rows) == 1
    assert bob_rows[0]["role"] == "admin"  # unchanged by the second add


def test_add_existing_invite_updates_its_role(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "carol@municorn.com", "role": "member"}]},
    )
    resp = client.post(
        f"/projects/{project.id}/members",
        headers=_auth(owner.id),
        json={"members": [{"email": "carol@municorn.com", "role": "admin"}]},
    )
    assert resp.json()["pending_members"] == [
        {"email": "carol@municorn.com", "role": "admin"}
    ]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_project_members_api.py -q -k add_`
Expected: FAIL — 405/404 (route not defined).

- [ ] **Step 3: Implement the endpoint**

In `backend/app/routers/projects.py`, add the request models near `ProjectMemberCreate` (after line 121) — or just above the new endpoint. Add the endpoint itself right after `get_project` / before `_serialize` (after line 967). Insert:

```python
class MemberInviteIn(BaseModel):
    # plain str (not EmailStr) — matches MeetingParticipantSuggestionOut.email and
    # avoids the email-validator dependency; emails come from Google, already valid.
    email: str = Field(min_length=3)
    role: ProjectRole = ProjectRole.member


class MembersBatchIn(BaseModel):
    members: list[MemberInviteIn] = Field(min_length=1)


class RoleUpdateIn(BaseModel):
    role: ProjectRole


@router.post("/{project_id}/members", response_model=ProjectOut)
def add_project_members(
    req: MembersBatchIn,
    project: Project = Depends(require_project_access),
    db: Session = Depends(get_db),
) -> ProjectOut:
    """Batch-add members by email (member-only).

    Email already owned by a registered user → a ``ProjectMember`` now (existing
    membership left untouched — no surprise role change). Unknown email → a
    ``PendingProjectMember`` invitation, realized on that person's first login.
    Idempotent.
    """
    for entry in req.members:
        email = entry.email.strip().lower()
        if not email:
            continue
        existing_user = (
            db.query(User).filter(func.lower(User.email) == email).first()
        )
        if existing_user is not None:
            membership = db.get(
                ProjectMember,
                {"project_id": project.id, "user_id": existing_user.id},
            )
            if membership is None:
                db.add(
                    ProjectMember(
                        project_id=project.id,
                        user_id=existing_user.id,
                        role=entry.role,
                    )
                )
            # Drop any now-redundant invitation for the same address.
            stale = db.get(
                PendingProjectMember,
                {"project_id": project.id, "email": email},
            )
            if stale is not None:
                db.delete(stale)
        else:
            invite = db.get(
                PendingProjectMember,
                {"project_id": project.id, "email": email},
            )
            if invite is None:
                db.add(
                    PendingProjectMember(
                        project_id=project.id, email=email, role=entry.role
                    )
                )
            else:
                invite.role = entry.role
    db.commit()
    db.refresh(project)
    return _serialize(project, db)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && .venv/bin/pytest tests/test_project_members_api.py -q -k add_`
Expected: PASS (all `add_` tests green).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/routers/projects.py backend/tests/test_project_members_api.py
rtk git commit -m "feat(members): POST /projects/{id}/members batch add (ScrumAgent-idt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: PATCH role — registered member & pending invitation

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_project_members_api.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_project_members_api.py`:

```python
# --- Task 4: PATCH role (member & pending) ---

def test_patch_member_role(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    bob = _make_user(db_session, "bob@municorn.com", "sub-b")
    project = _make_project(db_session, owner)
    db_session.add(
        ProjectMember(project_id=project.id, user_id=bob.id, role=ProjectRole.member)
    )
    db_session.commit()
    resp = client.patch(
        f"/projects/{project.id}/members/{bob.id}",
        headers=_auth(owner.id),
        json={"role": "admin"},
    )
    assert resp.status_code == 200
    bob_rows = [m for m in resp.json()["members"] if m["user_id"] == bob.id]
    assert bob_rows[0]["role"] == "admin"


def test_patch_member_role_404_when_not_a_member(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.patch(
        f"/projects/{project.id}/members/999999",
        headers=_auth(owner.id),
        json={"role": "admin"},
    )
    assert resp.status_code == 404


def test_patch_pending_member_role(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="carol@municorn.com", role=ProjectRole.member
        )
    )
    db_session.commit()
    resp = client.patch(
        f"/projects/{project.id}/pending-members/carol@municorn.com",
        headers=_auth(owner.id),
        json={"role": "viewer"},
    )
    assert resp.status_code == 200
    assert resp.json()["pending_members"] == [
        {"email": "carol@municorn.com", "role": "viewer"}
    ]


def test_patch_pending_member_role_404_when_no_invite(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    resp = client.patch(
        f"/projects/{project.id}/pending-members/nobody@municorn.com",
        headers=_auth(owner.id),
        json={"role": "viewer"},
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_project_members_api.py -q -k patch_`
Expected: FAIL — 405/404 (routes not defined).

- [ ] **Step 3: Implement the two endpoints**

In `backend/app/routers/projects.py`, immediately after the `add_project_members` endpoint added in Task 3, add:

```python
@router.patch("/{project_id}/members/{user_id}", response_model=ProjectOut)
def update_member_role(
    user_id: int,
    req: RoleUpdateIn,
    project: Project = Depends(require_project_access),
    db: Session = Depends(get_db),
) -> ProjectOut:
    """Change a registered member's role (member-only)."""
    membership = db.get(
        ProjectMember, {"project_id": project.id, "user_id": user_id}
    )
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    membership.role = req.role
    db.commit()
    db.refresh(project)
    return _serialize(project, db)


@router.patch("/{project_id}/pending-members/{email}", response_model=ProjectOut)
def update_pending_member_role(
    email: str,
    req: RoleUpdateIn,
    project: Project = Depends(require_project_access),
    db: Session = Depends(get_db),
) -> ProjectOut:
    """Change a pending invitation's role (member-only)."""
    key = email.strip().lower()
    invite = db.get(
        PendingProjectMember, {"project_id": project.id, "email": key}
    )
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    invite.role = req.role
    db.commit()
    db.refresh(project)
    return _serialize(project, db)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && .venv/bin/pytest tests/test_project_members_api.py -q -k patch_`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/routers/projects.py backend/tests/test_project_members_api.py
rtk git commit -m "feat(members): PATCH member + pending-member role (ScrumAgent-idt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `GET /{project_id}/member-suggestions`

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_project_members_api.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_project_members_api.py`:

```python
# --- Task 5: GET /{id}/member-suggestions ---

def _events_with(*emails_and_names) -> list[dict]:
    """One confirmed event whose attendees are the given (email, name) pairs."""
    return [
        {
            "id": "evt-1",
            "status": "confirmed",
            "start": {"dateTime": "2026-06-15T10:00:00+02:00"},
            "end": {"dateTime": "2026-06-15T11:00:00+02:00"},
            "organizer": {"email": "agent@municorn.com"},
            "attendees": [
                {"email": e, "displayName": n} for (e, n) in emails_and_names
            ],
        }
    ]


def test_suggestions_excludes_agent_members_and_pending(
    client, db_session, fake_calendar
):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="carol@municorn.com", role=ProjectRole.member
        )
    )
    db_session.commit()
    fake_calendar.events = _events_with(
        ("agent@municorn.com", "Agent"),      # the agent itself — excluded
        ("alice@municorn.com", "Alice"),      # a registered member — excluded
        ("carol@municorn.com", "Carol"),      # already invited — excluded
        ("dave@municorn.com", "Dave"),        # fresh — kept
    )
    resp = client.get(
        f"/projects/{project.id}/member-suggestions", headers=_auth(owner.id)
    )
    assert resp.status_code == 200
    assert resp.json() == [
        {"email": "dave@municorn.com", "display_name": "Dave", "event_count": 1}
    ]


def test_suggestions_409_when_no_google_credential(client, db_session):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner, refresh_token=None)
    resp = client.get(
        f"/projects/{project.id}/member-suggestions", headers=_auth(owner.id)
    )
    assert resp.status_code == 409


def test_suggestions_502_on_upstream_failure(client, db_session, fake_calendar):
    owner = _make_user(db_session, "alice@municorn.com", "sub-a")
    project = _make_project(db_session, owner)
    fake_calendar.error = GoogleCalendarError("boom")
    resp = client.get(
        f"/projects/{project.id}/member-suggestions", headers=_auth(owner.id)
    )
    assert resp.status_code == 502
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_project_members_api.py -q -k suggestions`
Expected: FAIL — 404 (route not defined).

- [ ] **Step 3: Implement the endpoint**

In `backend/app/routers/projects.py`, add right after the two PATCH endpoints from Task 4 (it reuses the existing `MeetingParticipantSuggestionOut`, `_participant_suggestions`, and the `get_google_calendar` dep already imported):

```python
@router.get(
    "/{project_id}/member-suggestions",
    response_model=list[MeetingParticipantSuggestionOut],
)
async def list_member_suggestions(
    days_back: int = Query(30, ge=0, le=365),
    days_forward: int = Query(60, ge=0, le=365),
    project: Project = Depends(require_project_access),
    db: Session = Depends(get_db),
    calendar: GoogleCalendarClient = Depends(get_google_calendar),
) -> list[MeetingParticipantSuggestionOut]:
    """Meeting participants not yet on the team (member-only).

    Same live-calendar source as ``/meetings``; runs ``_participant_suggestions``
    (which already drops the agent account), then excludes anyone who is already
    a registered member or has a pending invitation.
    """
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

    taken: set[str] = set()
    for member in project.members:
        member_user = db.get(User, member.user_id)
        if member_user is not None and member_user.email:
            taken.add(member_user.email.strip().lower())
    for invite in project.pending_members:
        taken.add(invite.email.strip().lower())

    return [
        s
        for s in _participant_suggestions(events, project.agent_email)
        if s.email not in taken  # s.email is already lower-cased by the aggregator
    ]
```

- [ ] **Step 4: Run to verify pass, then the whole file**

Run: `cd backend && .venv/bin/pytest tests/test_project_members_api.py -q`
Expected: PASS (all Task 2–5 tests green).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/routers/projects.py backend/tests/test_project_members_api.py
rtk git commit -m "feat(members): GET /projects/{id}/member-suggestions (ScrumAgent-idt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Invitation reconciliation at login

**Files:**
- Create: `backend/app/membership.py`
- Modify: `backend/app/routers/auth.py`
- Test: `backend/tests/test_membership.py` (create) + add 1 wiring test to `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing unit tests**

Create `backend/tests/test_membership.py`:

```python
"""grant_pending_memberships — invitation → membership reconciliation (ScrumAgent-idt)."""
from __future__ import annotations

from app.membership import grant_pending_memberships
from app.models import PendingProjectMember, Project, ProjectMember, User
from app.models.types import ProjectRole


def _owner_and_project(db) -> Project:
    owner = User(google_sub="sub-owner", email="owner@municorn.com", name="Owner")
    db.add(owner)
    db.commit()
    db.refresh(owner)
    project = Project(owner_id=owner.id, name="P", agent_email="agent@municorn.com")
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _invitee(db, email="carol@municorn.com") -> User:
    user = User(google_sub="sub-carol", email=email, name="Carol")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_grant_converts_invite_to_membership(db_session):
    project = _owner_and_project(db_session)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="carol@municorn.com", role=ProjectRole.viewer
        )
    )
    db_session.commit()
    carol = _invitee(db_session)

    grant_pending_memberships(db_session, carol)
    db_session.commit()

    membership = db_session.get(
        ProjectMember, {"project_id": project.id, "user_id": carol.id}
    )
    assert membership is not None
    assert membership.role is ProjectRole.viewer
    assert db_session.query(PendingProjectMember).count() == 0


def test_grant_is_idempotent(db_session):
    project = _owner_and_project(db_session)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="carol@municorn.com", role=ProjectRole.member
        )
    )
    db_session.commit()
    carol = _invitee(db_session)

    grant_pending_memberships(db_session, carol)
    db_session.commit()
    grant_pending_memberships(db_session, carol)  # second login — no-op
    db_session.commit()

    assert (
        db_session.query(ProjectMember)
        .filter_by(project_id=project.id, user_id=carol.id)
        .count()
        == 1
    )


def test_grant_consumes_invite_without_overwriting_existing_membership(db_session):
    project = _owner_and_project(db_session)
    carol = _invitee(db_session)
    db_session.add(
        ProjectMember(project_id=project.id, user_id=carol.id, role=ProjectRole.admin)
    )
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="carol@municorn.com", role=ProjectRole.viewer
        )
    )
    db_session.commit()

    grant_pending_memberships(db_session, carol)
    db_session.commit()

    membership = db_session.get(
        ProjectMember, {"project_id": project.id, "user_id": carol.id}
    )
    assert membership.role is ProjectRole.admin  # not downgraded by the invite
    assert db_session.query(PendingProjectMember).count() == 0
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_membership.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.membership'`.

- [ ] **Step 3: Create the helper**

Create `backend/app/membership.py`:

```python
"""Reconcile email project invitations into real memberships at login.

A ``PendingProjectMember`` is an invitation addressed to an email that had no
account when an operator added it in Settings → Members. On the invitee's first
Google login the auth callback calls ``grant_pending_memberships``, which turns
each invitation for that email into a real ``ProjectMember`` and consumes the
invitation. Idempotent — safe to run on every login.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import PendingProjectMember, ProjectMember, User


def grant_pending_memberships(db: Session, user: User) -> None:
    """Grant ``user`` membership for every invitation addressed to their email.

    Does not commit — the caller owns the transaction. An existing membership is
    left untouched (the invitation is still consumed, never a role downgrade).
    """
    email = (user.email or "").strip().lower()
    if not email:
        return
    invites = (
        db.query(PendingProjectMember)
        .filter(func.lower(PendingProjectMember.email) == email)
        .all()
    )
    for inv in invites:
        existing = db.get(
            ProjectMember, {"project_id": inv.project_id, "user_id": user.id}
        )
        if existing is None:
            db.add(
                ProjectMember(
                    project_id=inv.project_id, user_id=user.id, role=inv.role
                )
            )
        db.delete(inv)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && .venv/bin/pytest tests/test_membership.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Write the failing wiring test**

Append to `backend/tests/test_auth.py` (it already has `_login`, `make_client`, `municorn_userinfo`, `db_session`):

```python
def test_login_grants_pending_project_memberships(
    make_client, municorn_userinfo, db_session
):
    """A login consumes any invitation addressed to the user's email."""
    from app.models import (
        PendingProjectMember,
        Project,
        ProjectMember,
        User,
    )
    from app.models.types import ProjectRole

    # A project owned by someone else, with an invitation for alice@municorn.com
    # (the identity municorn_userinfo logs in as).
    owner = User(google_sub="sub-owner", email="owner@municorn.com", name="Owner")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)
    project = Project(owner_id=owner.id, name="P", agent_email="agent@municorn.com")
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db_session.add(project)
    db_session.add(
        PendingProjectMember(
            project_id=project.id, email="alice@municorn.com", role=ProjectRole.member
        )
    )
    db_session.commit()

    client = make_client(municorn_userinfo)
    _login(client)

    alice = db_session.query(User).filter_by(email="alice@municorn.com").one()
    membership = db_session.get(
        ProjectMember, {"project_id": project.id, "user_id": alice.id}
    )
    assert membership is not None
    assert membership.role is ProjectRole.member
    assert db_session.query(PendingProjectMember).count() == 0
```

- [ ] **Step 6: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_auth.py::test_login_grants_pending_project_memberships -q`
Expected: FAIL — membership is `None` (callback doesn't reconcile yet).

- [ ] **Step 7: Wire it into the callback**

In `backend/app/routers/auth.py`:

(a) Add the import after line 21 (`from app.models import User`):

```python
from app.membership import grant_pending_memberships
```

(b) In `google_callback`, replace the upsert/commit block (lines 91–92):

```python
    db.commit()
    db.refresh(user)
```

with:

```python
    db.commit()
    db.refresh(user)

    # Realize any email invitations addressed to this person (idempotent).
    grant_pending_memberships(db, user)
    db.commit()
```

- [ ] **Step 8: Run to verify pass (wiring + full auth file)**

Run: `cd backend && .venv/bin/pytest tests/test_auth.py tests/test_membership.py -q`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add backend/app/membership.py backend/app/routers/auth.py backend/tests/test_membership.py backend/tests/test_auth.py
rtk git commit -m "feat(members): reconcile invitations to memberships at login (ScrumAgent-idt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Backend gate — run the whole suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS (previous count + the new tests; no regressions).

---

## Task 7: Frontend API client

**Files:**
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Add `pending_members` + `PendingMemberOut` to the types**

In `apps/web/lib/api.ts`, add the `PendingMemberOut` interface right before `ProjectOut` (before line 137):

```typescript
export interface PendingMemberOut {
  email: string;
  role: ProjectRole;
}
```

and add the field to `ProjectOut` (after the `members: ProjectMemberOut[];` line, line 149):

```typescript
  pending_members: PendingMemberOut[];
```

- [ ] **Step 2: Add the four methods**

In the `api` object, add these after `listProjectMeetings` (after line 278). They reuse the existing `MeetingParticipantSuggestion` type for suggestions:

```typescript
  listMemberSuggestions: (projectId: string) =>
    apiFetch<MeetingParticipantSuggestion[]>(
      `/projects/${encodeURIComponent(projectId)}/member-suggestions`,
    ),
  addProjectMembers: (
    projectId: string,
    members: { email: string; role: ProjectRole }[],
  ) =>
    apiFetch<ProjectOut>(
      `/projects/${encodeURIComponent(projectId)}/members`,
      { method: "POST", body: JSON.stringify({ members }) },
    ),
  updateMemberRole: (projectId: string, userId: number, role: ProjectRole) =>
    apiFetch<ProjectOut>(
      `/projects/${encodeURIComponent(projectId)}/members/${userId}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    ),
  updatePendingMemberRole: (projectId: string, email: string, role: ProjectRole) =>
    apiFetch<ProjectOut>(
      `/projects/${encodeURIComponent(projectId)}/pending-members/${encodeURIComponent(
        email,
      )}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    ),
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix apps/web run typecheck`
Expected: PASS (no errors). Note: adding required `pending_members` to `ProjectOut` is safe — every consumer reads the object; none construct a `ProjectOut` literal.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/lib/api.ts
rtk git commit -m "feat(members): api client for member suggestions + mutations (ScrumAgent-idt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Rewrite `MembersSection.tsx` (editable roles + Suggested members) + CSS

**Files:**
- Modify: `apps/web/components/screens/settings/MembersSection.tsx` (full rewrite)
- Modify: `apps/web/styles/screens/settings.css` (one small rule)

- [ ] **Step 1: Replace the component**

Replace the entire contents of `apps/web/components/screens/settings/MembersSection.tsx` with:

```tsx
"use client";

import type { ChangeEvent, JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  api,
  type MeetingParticipantSuggestion,
  type ProjectOut,
  type ProjectRole,
} from "@/lib/api";
import { toParticipant } from "@/lib/avatar";

const ROLE_OPTIONS: readonly { value: ProjectRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "admin", label: "Admin" },
];

type SuggestState =
  | { status: "loading" }
  | { status: "ready"; rows: MeetingParticipantSuggestion[] }
  | { status: "not_connected" }
  | { status: "error"; message: string };

export function MembersSection(): JSX.Element {
  const [projects, setProjects] = useState<ProjectOut[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [suggest, setSuggest] = useState<SuggestState>({ status: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await api.listProjects();
        if (!active) return;
        setProjects(rows);
        setProjectId(rows[0]?.id ?? null);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof ApiError ? e.message : "Could not load projects.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadSuggestions = useCallback(async (id: string) => {
    setSuggest({ status: "loading" });
    try {
      const rows = await api.listMemberSuggestions(id);
      setSuggest({ status: "ready", rows });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      if (e instanceof ApiError && e.status === 409) {
        setSuggest({ status: "not_connected" });
        return;
      }
      setSuggest({
        status: "error",
        message:
          e instanceof ApiError ? e.message : "Could not load suggestions.",
      });
    }
  }, []);

  // Reload suggestions and reset the selection whenever the project changes.
  useEffect(() => {
    setSelected(new Set());
    setActionError(null);
    if (projectId) void loadSuggestions(projectId);
  }, [projectId, loadSuggestions]);

  const selectedProject =
    projects?.find((project) => project.id === projectId) ?? null;

  const replaceProject = (updated: ProjectOut) =>
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev,
    );

  const runMutation = async (fn: () => Promise<ProjectOut>) => {
    setBusy(true);
    setActionError(null);
    try {
      replaceProject(await fn());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setActionError(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const addSelected = async () => {
    if (!projectId || selected.size === 0) return;
    const members = [...selected].map((email) => ({
      email,
      role: "member" as ProjectRole,
    }));
    setBusy(true);
    setActionError(null);
    try {
      replaceProject(await api.addProjectMembers(projectId, members));
      setSelected(new Set());
      await loadSuggestions(projectId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setActionError(e instanceof ApiError ? e.message : "Could not add members.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (email: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  if (error) {
    return (
      <div className="project-error" role="alert">
        <Icon name="alert" size={12} />
        {error}
      </div>
    );
  }
  if (projects === null) {
    return <div className="muted">Loading projects...</div>;
  }
  if (projects.length === 0) {
    return (
      <div className="muted">
        No projects yet - create a project to manage members.
      </div>
    );
  }

  const members = selectedProject?.members ?? [];
  const pending = selectedProject?.pending_members ?? [];

  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <div className="setting-row">
          <div className="setting-row-label">
            <div className="setting-row-name">Project</div>
            <div className="setting-row-hint">
              Membership is scoped to the selected project.
            </div>
          </div>
          <div className="setting-row-control">
            <select
              className="select"
              style={{ width: 220 }}
              value={projectId ?? ""}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setProjectId(e.target.value)
              }
              aria-label="Project"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="setting-group">
        <h2 className="setting-group-title">Team members</h2>
        <p className="setting-group-sub">
          People who can chat with the agent and review proposed updates. Invited
          people join automatically the first time they sign in.
        </p>

        {actionError && (
          <div className="project-error" role="alert" style={{ marginBottom: 10 }}>
            <Icon name="alert" size={12} />
            {actionError}
          </div>
        )}

        {members.length === 0 && pending.length === 0 ? (
          <div className="muted" style={{ paddingTop: 8 }}>
            This project has no members yet.
          </div>
        ) : (
          <table className="members-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const participant = toParticipant(member.email, member.name);
                return (
                  <tr key={`m-${member.user_id}`}>
                    <td>
                      <div className="member-cell">
                        <Avatar participant={participant} size={28} />
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {member.name ?? member.email}
                          </div>
                          <div className="muted mono" style={{ fontSize: 11 }}>
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${member.name ?? member.email}`}
                        className="input member-role-select"
                        value={member.role}
                        disabled={busy}
                        onChange={(e) =>
                          void runMutation(() =>
                            api.updateMemberRole(
                              selectedProject!.id,
                              member.user_id,
                              e.target.value as ProjectRole,
                            ),
                          )
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {pending.map((invite) => {
                const participant = toParticipant(invite.email, null);
                return (
                  <tr key={`p-${invite.email}`} className="member-row-pending">
                    <td>
                      <div className="member-cell">
                        <Avatar participant={participant} size={28} />
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {invite.email}{" "}
                            <Badge variant="neutral">Invited</Badge>
                          </div>
                          <div className="muted mono" style={{ fontSize: 11 }}>
                            Joins on first sign-in
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${invite.email}`}
                        className="input member-role-select"
                        value={invite.role}
                        disabled={busy}
                        onChange={(e) =>
                          void runMutation(() =>
                            api.updatePendingMemberRole(
                              selectedProject!.id,
                              invite.email,
                              e.target.value as ProjectRole,
                            ),
                          )
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="setting-group">
        <h2 className="setting-group-title">Suggested members</h2>
        <p className="setting-group-sub">
          People from recent meetings on the agent&apos;s calendar. Select and add
          them, then set their roles above.
        </p>

        {suggest.status === "loading" && (
          <div className="muted" style={{ paddingTop: 8 }}>
            Loading suggestions…
          </div>
        )}
        {suggest.status === "not_connected" && (
          <div className="muted" style={{ paddingTop: 8 }}>
            Connect the agent&apos;s Google account (Settings → Integrations) to see
            meeting participants.
          </div>
        )}
        {suggest.status === "error" && (
          <div className="project-error" role="alert">
            <Icon name="alert" size={12} />
            {suggest.message}
          </div>
        )}
        {suggest.status === "ready" && suggest.rows.length === 0 && (
          <div className="muted" style={{ paddingTop: 8 }}>
            Everyone from recent meetings is already on the team.
          </div>
        )}
        {suggest.status === "ready" && suggest.rows.length > 0 && (
          <>
            <div className="notion-db-picker">
              {suggest.rows.map((row) => {
                const isSelected = selected.has(row.email);
                const participant = toParticipant(row.email, row.display_name);
                return (
                  <div
                    key={row.email}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    className={`db-option ${isSelected ? "selected" : ""}`}
                    onClick={() => toggle(row.email)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(row.email);
                      }
                    }}
                  >
                    <Avatar participant={participant} size={28} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>
                        {row.display_name ?? row.email}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {row.email}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 11, marginTop: 3 }}
                      >
                        {row.event_count} meeting
                        {row.event_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="member-select-check">
                      {isSelected && <Icon name="check" size={14} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <Button
                variant="primary"
                onClick={() => void addSelected()}
                disabled={busy || selected.size === 0}
              >
                Add selected{selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the pending-row style**

In `apps/web/styles/screens/settings.css`, append:

```css
/* Invited (not-yet-registered) members read as muted until they sign in. */
.members-table tbody tr.member-row-pending td {
  opacity: 0.72;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix apps/web run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/components/screens/settings/MembersSection.tsx apps/web/styles/screens/settings.css
rtk git commit -m "feat(members): editable roles + Suggested members in Settings (ScrumAgent-idt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Verify end-to-end, run gates, document, push

**Files:**
- Modify: `wiki/modules/project-provisioning.md`, `wiki/log.md`, `wiki/hot.md`

- [ ] **Step 1: Full backend gate**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS (all green).

- [ ] **Step 2: Frontend typecheck gate**

Run: `npm --prefix apps/web run typecheck`
Expected: PASS.

- [ ] **Step 3: Verify in the preview browser**

The `:3000` dev server runs `dev:preview` (`agent_preview` = see-all), so the new endpoints are reachable. Using the preview tools:
1. `preview_start` if needed; navigate to `/settings`, open the **Members** tab.
2. `preview_snapshot` — confirm **Team members** shows a role `<select>` per row and a **Suggested members** section renders (loading → one of: list / "already on the team" / "Connect the agent's Google account").
3. If a Google-connected project with calendar events exists: select a suggestion, click **Add selected (N)**, `preview_snapshot` — confirm the person moves into Team members and drops out of suggestions. Change their role in Team members; `preview_snapshot` to confirm it sticks (and `preview_network` shows the PATCH returning 200).
4. `preview_console_logs` — confirm no errors.
5. `preview_screenshot` — capture the final Members tab for the summary.

Document any path not exercisable locally (e.g. no Google-connected project → suggestions show "not connected"; that is expected, not a bug).

- [ ] **Step 4: Update the wiki**

In `wiki/modules/project-provisioning.md`: note that project membership is now mutable after creation (batch add by email + role PATCH) and that email invitations (`PendingProjectMember`) are reconciled into memberships in the Google login callback (`app/membership.py`). Bump `updated:` in frontmatter.

Append a dated entry at the top of `wiki/log.md` and refresh `wiki/hot.md` (~500 words) summarizing this slice.

- [ ] **Step 5: Close bd issue**

```bash
bd close ScrumAgent-idt --reason="Suggested members + batch-add + editable roles shipped; backend pytest + tsc green, verified in preview."
```

- [ ] **Step 6: Push (mandatory per CLAUDE.md session protocol)**

```bash
rtk git pull --rebase
bd dolt push
rtk git push
rtk git status   # MUST show up to date with origin
```

---

## Self-review notes (already reconciled against the spec)

- **Spec coverage:** §4.1 model → Task 1; §4.2 ProjectOut → Task 2; §5.1 suggestions → Task 5; §5.2 batch add → Task 3; §5.3/§5.4 PATCH → Task 4; §6 reconciliation → Task 6; §7 frontend → Tasks 7–8; §8 tests → embedded per task + Task 9 gates.
- **DRY deviation from spec naming:** reuse `MeetingParticipantSuggestionOut` / `MeetingParticipantSuggestion` instead of a new `MemberSuggestionOut` — identical shape. Noted in the header.
- **Type consistency:** `MembersBatchIn.members` → `MemberInviteIn{email,role}`; `RoleUpdateIn{role}`; `grant_pending_memberships(db, user)` called in Task 6 matches its definition; FE `api.addProjectMembers/updateMemberRole/updatePendingMemberRole/listMemberSuggestions` signatures match Task 7 ↔ Task 8 call sites.
- **No placeholders:** every code step has complete code; every run step has an exact command + expected result.
- **Additive-field safety:** confirmed no backend full-dict/key-set assertion on `ProjectOut` and no frontend `ProjectOut` literal — so `pending_members` won't break existing tests/`tsc`.
