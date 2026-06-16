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
