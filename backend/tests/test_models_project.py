"""Project domain models (ScrumAgent-lb9.1).

Covers the four new tables — Project, ProjectMember, ProjectCredential,
PendingOAuth — their defaults, the member composite PK + role enum, and
encryption-at-rest for every secret column.
"""
from sqlalchemy import text

from app.models import (
    PendingOAuth,
    Project,
    ProjectCredential,
    ProjectMember,
    User,
)
from app.models.types import ProjectRole


def _make_user(db, email="owner@municorn.com", sub="sub-owner"):
    user = User(google_sub=sub, email=email, name="Owner")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_project_persists_with_owner_and_defaults(db_session):
    owner = _make_user(db_session)
    project = Project(
        owner_id=owner.id,
        name="Platform",
        agent_email="telecom.scrum.agent@municorn.com",
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    assert project.id  # UUID assigned by UUIDPKMixin
    assert project.google_connected is False
    assert project.color == "#0077e6"
    assert project.created_at is not None


def test_project_member_composite_pk_and_role(db_session):
    owner = _make_user(db_session)
    project = Project(owner_id=owner.id, name="P", agent_email="a@municorn.com")
    db_session.add(project)
    db_session.commit()

    db_session.add(
        ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.admin)
    )
    db_session.commit()

    got = db_session.get(
        ProjectMember, {"project_id": project.id, "user_id": owner.id}
    )
    assert got.role == ProjectRole.admin


def test_project_member_defaults_to_member_role(db_session):
    owner = _make_user(db_session)
    bob = _make_user(db_session, email="bob@municorn.com", sub="sub-bob")
    project = Project(owner_id=owner.id, name="P", agent_email="a@municorn.com")
    db_session.add(project)
    db_session.commit()

    member = ProjectMember(project_id=project.id, user_id=bob.id)
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)

    assert member.role == ProjectRole.member


def test_project_members_relationship(db_session):
    owner = _make_user(db_session)
    project = Project(owner_id=owner.id, name="P", agent_email="a@municorn.com")
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    assert len(project.members) == 1
    assert project.members[0].user_id == owner.id


def test_credentials_encrypted_at_rest(db_session):
    owner = _make_user(db_session)
    project = Project(owner_id=owner.id, name="P", agent_email="a@municorn.com")
    db_session.add(project)
    db_session.commit()

    db_session.add(
        ProjectCredential(
            project_id=project.id,
            google_refresh_token="1//refresh-secret",
            jira_api_token="jira-tok-secret",
            notion_token="ntn_secret",
        )
    )
    db_session.commit()

    raw = db_session.execute(
        text(
            "SELECT google_refresh_token, jira_api_token, notion_token "
            "FROM project_credentials WHERE project_id=:pid"
        ),
        {"pid": project.id},
    ).one()
    assert "1//refresh-secret" not in (raw[0] or "")
    assert "jira-tok-secret" not in (raw[1] or "")
    assert "ntn_secret" not in (raw[2] or "")

    got = db_session.get(ProjectCredential, project.id)
    assert got.google_refresh_token == "1//refresh-secret"
    assert got.jira_api_token == "jira-tok-secret"
    assert got.notion_token == "ntn_secret"


def test_pending_oauth_refresh_token_encrypted(db_session):
    owner = _make_user(db_session)
    pending = PendingOAuth(
        user_id=owner.id,
        provider="google",
        account_email="telecom.scrum.agent@municorn.com",
        refresh_token="1//pending-secret",
        scopes="openid email https://www.googleapis.com/auth/calendar.events",
    )
    db_session.add(pending)
    db_session.commit()
    db_session.refresh(pending)

    assert pending.id
    raw = db_session.execute(
        text("SELECT refresh_token FROM pending_oauth WHERE id=:i"), {"i": pending.id}
    ).scalar()
    assert raw != "1//pending-secret"
    assert "1//pending-secret" not in raw

    got = db_session.get(PendingOAuth, pending.id)
    assert got.refresh_token == "1//pending-secret"
    assert got.provider == "google"


def test_project_auto_sync_enabled_defaults_true(db_session):
    owner = _make_user(db_session)
    project = Project(owner_id=owner.id, name="P", agent_email="a@municorn.com")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    assert project.auto_sync_enabled is True


def test_project_sync_state_defaults_and_persists():
    from datetime import datetime, timezone
    from app.database import init_db, make_engine
    from app.models import Project, ProjectSyncState
    from app.models.user import User
    from app.security import crypto
    from sqlalchemy.orm import sessionmaker

    crypto.configure("test-secret")
    engine = make_engine("sqlite://")
    init_db(engine)
    db = sessionmaker(bind=engine, autoflush=False, future=True)()

    user = User(google_sub="s", email="a@m.com", name="A")
    db.add(user); db.commit(); db.refresh(user)
    project = Project(owner_id=user.id, name="P", agent_email="a@m.com")
    db.add(project); db.commit(); db.refresh(project)

    state = ProjectSyncState(project_id=project.id)
    db.add(state); db.commit(); db.refresh(state)
    assert state.jira_synced_until is None
    assert state.notion_synced_until is None

    state.jira_synced_until = datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc)
    db.commit(); db.refresh(state)
    assert state.jira_synced_until.year == 2026
