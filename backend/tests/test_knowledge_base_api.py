from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.main import app
from app.models import Project, ProjectCredential, ProjectMember, User
from app.models.ingestion import IngestionRun
from app.models.types import IngestionStatus, IngestionTrigger, ProjectRole
from app.security import create_access_token

SECRET = "router-test-secret"


def _settings() -> Settings:
    return Settings(
        _env_file=None, secret_key=SECRET, openai_api_key="k",
        google_client_id="cid", google_client_secret="csec",
        backend_base_url="http://testserver", frontend_base_url="http://localhost:3000",
        allowed_domain="municorn.com",
    )


class FakeRunner:
    def __init__(self) -> None:
        self.scheduled: list[str] = []

    def schedule(self, run_id: str) -> None:
        self.scheduled.append(run_id)


@pytest.fixture
def runner() -> FakeRunner:
    return FakeRunner()


@pytest.fixture
def client(db_session, runner):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_ingestion_runner] = lambda: runner
    # status endpoint builds a real RagBackend; point it at a transport that returns no docs
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


def _auth(uid: int) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(uid), SECRET, extra={'env': 'production'})}"}


def _user(db, email="alice@municorn.com", sub="sub-alice") -> User:
    user = User(google_sub=sub, email=email, name="Alice")
    db.add(user); db.commit(); db.refresh(user)
    return user


def _project(db, owner, role=ProjectRole.admin, *, with_jira=True) -> Project:
    project = Project(
        owner_id=owner.id, name="P", agent_email="a@municorn.com", google_connected=True,
        jira_site_url="https://m.atlassian.net" if with_jira else None,
        jira_user_email="a@municorn.com" if with_jira else None,
        jira_project_key="PLAT" if with_jira else None,
    )
    project.credential = ProjectCredential(google_refresh_token="rt", jira_api_token="t" if with_jira else None)
    project.members.append(ProjectMember(user_id=owner.id, role=role))
    db.add(project); db.commit(); db.refresh(project)
    return project


def test_resync_admin_creates_run_and_schedules(client, db_session, runner):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.admin)
    resp = client.post(f"/projects/{project.id}/knowledge-base/resync", headers=_auth(user.id))
    assert resp.status_code == 202
    body = resp.json()
    assert body["trigger"] == "resync"
    runs = db_session.query(IngestionRun).filter(IngestionRun.project_id == project.id).all()
    assert len(runs) == 1
    assert runner.scheduled == [runs[0].id]


class _LoopRequiringRunner:
    """Mimics the real IngestionRunner: schedule() calls asyncio.create_task,
    which raises 'no running event loop' if the endpoint isn't run on the loop.

    The plain FakeRunner doesn't create_task, so it can't catch a sync endpoint
    being run in a threadpool (ScrumAgent-54k)."""

    def __init__(self) -> None:
        self.scheduled: list[str] = []
        self._tasks: list = []

    def schedule(self, run_id: str) -> None:
        import asyncio

        self._tasks.append(asyncio.create_task(asyncio.sleep(0)))
        self.scheduled.append(run_id)


def test_resync_runs_on_event_loop_so_scheduling_succeeds(db_session):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.admin)
    loop_runner = _LoopRequiringRunner()

    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_ingestion_runner] = lambda: loop_runner
    try:
        c = TestClient(app, follow_redirects=False)
        resp = c.post(
            f"/projects/{project.id}/knowledge-base/resync", headers=_auth(user.id)
        )
        assert resp.status_code == 202
        assert loop_runner.scheduled == [resp.json()["id"]]
    finally:
        app.dependency_overrides.clear()


def test_resync_non_admin_forbidden(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.member)
    resp = client.post(f"/projects/{project.id}/knowledge-base/resync", headers=_auth(user.id))
    assert resp.status_code == 403


def test_resync_without_integration_conflict(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.admin, with_jira=False)
    resp = client.post(f"/projects/{project.id}/knowledge-base/resync", headers=_auth(user.id))
    assert resp.status_code == 409


def test_status_returns_last_run(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user)
    run = IngestionRun(
        project_id=project.id, trigger=IngestionTrigger.created,
        status=IngestionStatus.completed, jira_total=3, jira_submitted=3, failed_count=0,
    )
    db_session.add(run); db_session.commit()
    resp = client.get(f"/projects/{project.id}/knowledge-base/status", headers=_auth(user.id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["last_run"]["status"] == "completed"
    assert body["last_run"]["jira_submitted"] == 3
    assert body["rag"] is None


def test_status_includes_auto_sync_fields(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user)
    resp = client.get(
        f"/projects/{project.id}/knowledge-base/status", headers=_auth(user.id)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["auto_sync_enabled"] is True  # on by default
    assert body["auto_sync_interval_hours"] == 6.0
    assert body["next_sync_at"] is None  # never synced yet


def test_status_next_sync_at_is_interval_after_last_success(client, db_session):
    from datetime import datetime, timezone

    user = _user(db_session)
    project = _project(db_session, user)
    finished = datetime(2026, 6, 17, 0, 0, tzinfo=timezone.utc)
    db_session.add(
        IngestionRun(
            project_id=project.id,
            trigger=IngestionTrigger.auto,
            status=IngestionStatus.completed,
            finished_at=finished,
        )
    )
    db_session.commit()
    resp = client.get(
        f"/projects/{project.id}/knowledge-base/status", headers=_auth(user.id)
    )
    body = resp.json()
    # 6h after the last successful run
    assert body["next_sync_at"].startswith("2026-06-17T06:00")


def test_auto_sync_toggle_admin_updates_flag(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.admin)
    resp = client.put(
        f"/projects/{project.id}/knowledge-base/auto-sync",
        headers=_auth(user.id),
        json={"enabled": False},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["auto_sync_enabled"] is False
    assert body["next_sync_at"] is None  # disabled -> no scheduled next sync
    db_session.expire_all()
    assert db_session.get(Project, project.id).auto_sync_enabled is False


def test_auto_sync_toggle_non_admin_forbidden(client, db_session):
    user = _user(db_session)
    project = _project(db_session, user, role=ProjectRole.member)
    resp = client.put(
        f"/projects/{project.id}/knowledge-base/auto-sync",
        headers=_auth(user.id),
        json={"enabled": False},
    )
    assert resp.status_code == 403


def test_create_project_with_jira_enqueues_run(client, db_session, runner):
    from app.models import PendingOAuth

    user = _user(db_session)
    pending = PendingOAuth(
        user_id=user.id, provider="google", account_email="agent@municorn.com",
        refresh_token="1//rt", scopes="openid email",
    )
    db_session.add(pending); db_session.commit(); db_session.refresh(pending)

    # Jira validation is network-touching; override validators to pass.
    from app import deps
    from app.integrations import ValidationResult

    class _OkValidators:
        async def validate_jira(self, **_kw): return ValidationResult(ok=True)
        async def validate_notion(self, **_kw): return ValidationResult(ok=True)

    app.dependency_overrides[deps.get_integration_validators] = lambda: _OkValidators()

    resp = client.post(
        "/projects",
        headers=_auth(user.id),
        json={
            "name": "Telecom",
            "google_auth_session_id": pending.id,
            "jira": {"site_url": "https://m.atlassian.net", "user_email": "agent@municorn.com",
                     "api_token": "tok", "project_key": "PLAT"},
        },
    )
    assert resp.status_code == 201
    assert len(runner.scheduled) == 1


def test_create_project_without_integration_does_not_enqueue(client, db_session, runner):
    from app.models import PendingOAuth

    user = _user(db_session, email="bob@municorn.com", sub="sub-bob")
    pending = PendingOAuth(
        user_id=user.id, provider="google", account_email="agent@municorn.com",
        refresh_token="1//rt", scopes="openid email",
    )
    db_session.add(pending); db_session.commit(); db_session.refresh(pending)

    resp = client.post(
        "/projects",
        headers=_auth(user.id),
        json={"name": "Solo", "google_auth_session_id": pending.id},
    )
    assert resp.status_code == 201
    assert runner.scheduled == []
