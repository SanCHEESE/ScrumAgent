# Suggested members → batch-add → roles in Team members — design

- **Date:** 2026-06-16
- **Status:** Approved (ready for `bd` task breakdown)
- **Area:** `apps/web` (Settings → Members) + `backend/app` (project membership + auth reconciliation)
- **Scope:** Full-stack. Add a "Suggested members" section to Settings → Members that surfaces meeting participants, lets an operator select and batch-add them to the team, and then edit their roles in "Team members". Members who don't yet have an account are persisted as **email invitations** and become real members automatically on their first Google login.

## 1. Context

Settings → Members (`apps/web/components/screens/settings/MembersSection.tsx`) is
today **read-only**: a project dropdown plus a table of members with role
**badges**. There is no way to add a member or change a role from the UI.

On the backend, project membership is only ever set at **project creation**
(`POST /projects` in `app/routers/projects.py`). There is **no** add / update /
remove member endpoint. `ProjectMember` has a composite PK `(project_id, user_id)`
with a hard FK to `users.id` — so a member must be a registered `User`. Meeting
participants, by contrast, are only **emails** harvested live from the project
agent's Google Calendar.

Building blocks that already exist and will be reused:

- `app/routers/projects.py` → `_participant_suggestions(events, agent_email)` —
  aggregates `{email, display_name, event_count}` from raw Google events, already
  lower-casing emails and excluding the agent account.
- `app/routers/projects.py` → `list_project_meetings` — the live-calendar fetch
  pattern (project refresh token → `GoogleCalendarClient.list_events` → 409 when
  Google is not connected / revoked). The new suggestions endpoint mirrors it.
- `app/routers/projects.py` → `require_project_access` / `can_access_all_projects`
  — the per-project access gate (membership-scoped, with the `agent_preview`
  see-all bypass). All new endpoints depend on it.
- `app/routers/projects.py` → `_serialize(project, db)` — the single `ProjectOut`
  serializer; extended here to also emit pending invitations.
- `app/routers/auth.py` → `google_callback` — the Google login upsert; the exact
  hook point for invitation reconciliation (right after `db.refresh(user)`).
- `apps/web/components/screens/projects/StepMembers.tsx` — the selectable-list
  pattern (`.notion-db-picker` / `.db-option` / `.member-select-check`) and
  selection state (array of ids + role map) the new section mirrors.
- `apps/web/lib/avatar.ts` → `toParticipant`, `apps/web/components/ui/` (`Avatar`,
  `Badge`, `Button`, `Icon`) — reused as-is.

Schema bootstraps via `init_db()` / `Base.metadata.create_all` in the FastAPI
lifespan (no Alembic). A new table is created automatically on next startup;
existing tables are untouched.

## 2. Decisions (confirmed with user)

1. **Members who have no account are persisted, not dropped.** "Don't register
   them, but write them to the DB; when they register they'll have the project in
   scope with their role." → an **email-invitation** row, reconciled to a real
   `ProjectMember` on first login.
2. **Invitation modeled as a separate table** `PendingProjectMember`, *not* a
   nullable `user_id` on `ProjectMember`. Rationale: `ProjectMember`'s PK is
   `(project_id, user_id)`; making `user_id` nullable breaks the PK and ripples
   through all membership code. A parallel table keeps `ProjectMember` exactly as
   is and isolates the invite concept.
3. **Reconciliation runs on every login** (idempotent), not only on first
   user-creation — this also covers "invited after the person had already signed
   in once".
4. **Suggested members carry no per-row role.** They are batch-added with the
   default role `member`; the operator then changes roles in Team members. (Matches
   the requested flow: select → batch-add → edit roles.)
5. **Mutations are gated by `require_project_access` only** (any member with
   project access, incl. the `agent_preview` see-all dev user). No admin-only
   per-action check in this slice — there is no per-action role gating anywhere in
   the codebase yet, and a strict admin check would lock the see-all preview user
   (who is not a member) out of the feature. Filed as a hardening follow-up.

## 3. Non-goals / scope boundaries (each a `bd` follow-up)

- **No removal** of members or invitations (request was add + role-change only).
- **No admin-only gating** of mutations (see Decision 5).
- **No invitation expiry** — `PendingProjectMember` rows live until consumed or the
  project is deleted (consistent with `PendingOAuth`, which also never expires).
- **Not retrofitting the creation wizard** (`StepMembers`) onto the new invite
  table — it keeps adding existing users by `user_id`. The invite path is
  Settings-only in this slice.
- **No email/notification** is sent to the invited person; the invite is silent and
  realized on their next login.

## 4. Data model (backend)

### 4.1 New model `PendingProjectMember` (`app/models/project.py`)

```python
class PendingProjectMember(TimestampMixin, Base):
    __tablename__ = "pending_project_members"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), primary_key=True
    )
    # Stored lower-cased; matched against User.email at login.
    email: Mapped[str] = mapped_column(String(320), primary_key=True)
    role: Mapped[ProjectRole] = mapped_column(
        SAEnum(ProjectRole, native_enum=False),
        default=ProjectRole.member,
        nullable=False,
    )

    project: Mapped["Project"] = relationship(back_populates="pending_members")
```

- Composite PK `(project_id, email)` → at most one invite per (project, email),
  natural upsert key.
- `Project.pending_members` relationship with `cascade="all, delete-orphan"` so
  deleting a project removes its invites.
- Registered in `app/models/__init__.py` (import + `__all__`).

### 4.2 `ProjectOut` extension (`app/routers/projects.py`)

```python
class PendingMemberOut(BaseModel):
    email: str
    role: str

class ProjectOut(BaseModel):
    ...                       # unchanged fields
    members: list[MemberOut]
    pending_members: list[PendingMemberOut]   # NEW — additive
    created_at: datetime
```

`_serialize` emits `pending_members` from `project.pending_members`. Additive
field → safe for every existing `ProjectOut` consumer (shell, Home, etc.).

## 5. Backend endpoints (`app/routers/projects.py`)

All depend on `require_project_access` (path resolves to a `Project` the caller may
see). All mutating endpoints return the **full updated `ProjectOut`** so the client
replaces the project in local state in one step.

### 5.1 `GET /{project_id}/member-suggestions` → `list[MemberSuggestionOut]`

```python
class MemberSuggestionOut(BaseModel):
    email: str
    display_name: str | None
    event_count: int
```

- Mirrors `list_project_meetings`: read the project's Google refresh token; 409 if
  absent / revoked; 502 on Calendar error.
- `_participant_suggestions(events, project.agent_email)` → then **exclude** any
  email already present as a registered member (the members' `User.email`,
  lower-cased) or as a `PendingProjectMember`.
- Sorted by `event_count` desc, then email.

### 5.2 `POST /{project_id}/members` → `ProjectOut`

```python
class MemberInviteIn(BaseModel):
    email: str = Field(min_length=3)   # plain str — matches existing
                                        # MeetingParticipantSuggestionOut.email;
                                        # avoids the email-validator dependency
    role: ProjectRole = ProjectRole.member

class MembersBatchIn(BaseModel):
    members: list[MemberInviteIn] = Field(min_length=1)
```

For each entry (email `.strip().lower()`, skip blanks):

- If a `User` with that email exists (`func.lower(User.email) == email`, take
  first): ensure a `ProjectMember(user_id, role)` — create if absent; if already a
  member, leave the existing role untouched (idempotent, no surprise demotion).
  Drop any stale `PendingProjectMember` for that email.
- Else: upsert `PendingProjectMember(project_id, email, role)` (update role if the
  invite already exists).

One commit. Returns re-serialized `ProjectOut`.

### 5.3 `PATCH /{project_id}/members/{user_id}` → `ProjectOut`

Body `{ "role": ProjectRole }`. Updates a registered member's role; 404 if no such
membership.

### 5.4 `PATCH /{project_id}/pending-members/{email}` → `ProjectOut`

Body `{ "role": ProjectRole }`. Updates an invitation's role; 404 if no such
invite. `email` is URL-encoded by the client; lower-cased server-side before
lookup.

## 6. Invitation reconciliation (`app/routers/auth.py`)

New helper (co-located with membership logic, imported into `auth`):

```python
def grant_pending_memberships(db: Session, user: User) -> None:
    """Convert this user's email invitations into real memberships. Idempotent."""
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

Called in `google_callback` **after** `db.refresh(user)` and **before** the final
commit (folded into the same transaction that upserts the user). On every login,
not just creation.

## 7. Frontend (`apps/web`)

### 7.1 API client (`lib/api.ts`)

- Extend `ProjectOut` type with `pending_members: PendingMemberOut[]` and add
  `PendingMemberOut`, `MemberSuggestion` types.
- New methods:
  - `listMemberSuggestions(projectId)` → `MemberSuggestion[]`
  - `addProjectMembers(projectId, members: {email, role}[])` → `ProjectOut`
  - `updateMemberRole(projectId, userId, role)` → `ProjectOut`
  - `updatePendingMemberRole(projectId, email, role)` → `ProjectOut`

### 7.2 `MembersSection.tsx`

- **Team members table** becomes editable:
  - Role column → `<select className="input member-role-select">` (viewer / member
    / admin). Registered rows → `updateMemberRole`; pending rows →
    `updatePendingMemberRole`. On success, replace the project in local state from
    the returned `ProjectOut`.
  - Rows are `members` (registered) followed by `pending_members` (invited). Invited
    rows show an **"Invited"** `Badge` next to the name and a muted style; they have
    no `user_id`, so the avatar/identity is keyed on email.
  - Inline per-row saving + error state; a row-level disabled state while its PATCH
    is in flight.
- **Suggested members** (new section below Team members):
  - On project select, `listMemberSuggestions(projectId)`. States: loading; empty
    ("Everyone from recent meetings is already on the team."); not-connected (the
    409 → "Connect the agent's Google account to see meeting participants.").
  - Selectable list in the `StepMembers` idiom (`.notion-db-picker` / `.db-option`
    with `.selected` + `.member-select-check` check icon), each row = `Avatar` +
    name + email + "N meeting(s)". Selection state = `Set<string>` of emails.
  - **`Add selected (N)`** primary button → `addProjectMembers(projectId, emails
    with role "member")` → on success replace the project in state (Team members
    grows) and re-fetch suggestions (added people drop out). Disabled when nothing
    selected or while adding.

### 7.3 CSS

Reuse existing classes (`.members-table`, `.member-cell`, `.notion-db-picker`,
`.db-option`, `.member-role-select`, `.member-select-check`, `.setting-group*`).
Add only minor rules if needed (e.g. an "invited" muted row modifier) in
`apps/web/styles/screens/settings.css`.

## 8. Testing

### 8.1 Backend (`backend/tests`, pytest — primary safety net, TDD)

- `POST /{id}/members`: existing-user email → `ProjectMember` appears in
  `ProjectOut.members`; unknown email → appears in `ProjectOut.pending_members`;
  mixed batch; idempotent re-add (no duplicate, no role change for existing
  member); pending role upsert.
- `PATCH /{id}/members/{user_id}` and `PATCH /{id}/pending-members/{email}`: role
  changes reflected; 404 for unknown target.
- `GET /{id}/member-suggestions`: with a stubbed calendar client, excludes the
  agent email, existing members, and pending invites; 409 when no Google refresh
  token. (Mirror the existing calendar-client override used by the `/meetings`
  tests.)
- **Reconciliation**: seed a `PendingProjectMember`, drive `google_callback` (or
  call `grant_pending_memberships`) for a user with the matching email → a
  `ProjectMember` exists with the invited role and the pending row is gone; running
  twice is a no-op; an already-member email just consumes the invite.

### 8.2 Frontend

No unit-test runner in `apps/web`. Verify via the preview browser against the
running `:3000` dev server (`agent_preview` = see-all, so the new endpoints are
reachable without being a member): Team-members role editing and the Suggested
members select → batch-add → appears in Team members flow. Document any state
(e.g. live suggestions) that can't be exercised locally without a Google-connected
project + calendar events.

## 9. File-by-file change list

**Backend**
- `app/models/project.py` — `PendingProjectMember` + `Project.pending_members`.
- `app/models/__init__.py` — register the new model.
- `app/routers/projects.py` — `PendingMemberOut`, `ProjectOut.pending_members`,
  `_serialize` change; `MemberSuggestionOut`, `MemberInviteIn`, `MembersBatchIn`;
  four endpoints (§5); `grant_pending_memberships` helper.
- `app/routers/auth.py` — call `grant_pending_memberships` in `google_callback`.
- `backend/tests/...` — new tests (§8.1).

**Frontend**
- `apps/web/lib/api.ts` — types + four methods (§7.1).
- `apps/web/components/screens/settings/MembersSection.tsx` — editable Team members
  + Suggested members section (§7.2).
- `apps/web/styles/screens/settings.css` — minor additions if needed.

**Docs / tracking**
- This spec; `bd` issue(s) for the slice + the deferred follow-ups (§3).
- Wiki: update `wiki/modules/project-provisioning.md` (membership now mutable +
  email-invite reconciliation) and the usual end-of-session `log.md` / `hot.md`.
