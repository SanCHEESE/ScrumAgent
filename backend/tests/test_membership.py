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
