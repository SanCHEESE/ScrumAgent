"""GET /projects/{id}/billing — per-project usage/cost aggregation (ScrumAgent-307).

The endpoint aggregates ``llm_usage`` events (written by the LLM gateway) into
the Settings → Billing view: current-cycle totals, per-category and per-model
breakdowns, and recent invocations grouped by run.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.main import app
from app.models import LlmUsage, Project, ProjectMember, User
from app.models.types import ProjectRole, UsageKind
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


@pytest.fixture
def client(db_session):
    def _ov_db():
        yield db_session

    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


def _auth(uid: int) -> dict:
    token = create_access_token(str(uid), SECRET, extra={"env": "production"})
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, email="alice@municorn.com", sub="sub-alice") -> User:
    user = User(google_sub=sub, email=email, name="Alice")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_project(db, owner: User, name="Telecom") -> Project:
    project = Project(
        owner_id=owner.id,
        name=name,
        agent_email="agent@municorn.com",
        google_connected=True,
    )
    project.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.admin))
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _make_usage(db, project: Project, **kw) -> LlmUsage:
    defaults = dict(
        project_id=project.id,
        provider="openai",
        model="gpt-5.4-mini",
        kind=UsageKind.llm,
        category="orchestrator",
        input_units=1.0,
        output_units=0.5,
        cost_usd=1.0,
        created_at=datetime.now(timezone.utc),
    )
    defaults.update(kw)
    row = LlmUsage(**defaults)
    db.add(row)
    db.commit()
    return row


def test_requires_auth(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    assert client.get(f"/projects/{project.id}/billing").status_code == 401


def test_404_for_non_member(client, db_session):
    owner = _make_user(db_session)
    project = _make_project(db_session, owner)
    outsider = _make_user(db_session, email="bob@municorn.com", sub="sub-bob")
    resp = client.get(f"/projects/{project.id}/billing", headers=_auth(outsider.id))
    assert resp.status_code == 404


def test_empty_project_returns_zeros(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    resp = client.get(f"/projects/{project.id}/billing", headers=_auth(user.id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["cycle"]["mtd_usd"] == 0
    assert body["cycle"]["projected_usd"] == 0
    assert body["cycle"]["days_remaining"] >= 0
    assert body["by_category"] == []
    assert body["by_model"] == []
    assert body["recent"] == []
    assert body["invocations_this_cycle"] == 0


def test_aggregates_current_cycle_only(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    _make_usage(db_session, project, cost_usd=2.0)
    _make_usage(
        db_session,
        project,
        model="whisper-1",
        kind=UsageKind.stt,
        category="whisper",
        cost_usd=3.0,
    )
    # Previous cycle — must not count.
    _make_usage(
        db_session,
        project,
        cost_usd=50.0,
        created_at=datetime.now(timezone.utc) - timedelta(days=45),
    )

    resp = client.get(f"/projects/{project.id}/billing", headers=_auth(user.id))
    body = resp.json()
    assert body["cycle"]["mtd_usd"] == pytest.approx(5.0)
    assert body["cycle"]["projected_usd"] >= body["cycle"]["mtd_usd"]
    cats = {c["category"]: c["cost_usd"] for c in body["by_category"]}
    assert cats == {"orchestrator": pytest.approx(2.0), "whisper": pytest.approx(3.0)}


def test_by_model_aggregates_calls_and_units(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    _make_usage(db_session, project, input_units=1.0, output_units=0.2, cost_usd=1.0)
    _make_usage(db_session, project, input_units=2.0, output_units=0.3, cost_usd=2.5)

    resp = client.get(f"/projects/{project.id}/billing", headers=_auth(user.id))
    models = resp.json()["by_model"]
    assert len(models) == 1
    m = models[0]
    assert m["model"] == "gpt-5.4-mini"
    assert m["kind"] == "llm"
    assert m["calls"] == 2
    assert m["input_units"] == pytest.approx(3.0)
    assert m["output_units"] == pytest.approx(0.5)
    assert m["cost_usd"] == pytest.approx(3.5)
    assert len(m["daily_usd"]) == 10
    # Both events landed today — the last bucket carries the full cost.
    assert m["daily_usd"][-1] == pytest.approx(3.5)


def test_recent_groups_events_by_run(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    earlier = datetime.now(timezone.utc) - timedelta(hours=2)
    _make_usage(
        db_session, project, run_id="run-1", context="Daily Standup",
        cost_usd=1.0, created_at=earlier,
    )
    _make_usage(
        db_session, project, run_id="run-1", model="whisper-1",
        kind=UsageKind.stt, category="whisper", cost_usd=0.5, created_at=earlier,
    )
    _make_usage(
        db_session, project, run_id="run-2", context="Sprint Planning", cost_usd=2.0
    )

    resp = client.get(f"/projects/{project.id}/billing", headers=_auth(user.id))
    body = resp.json()
    assert body["invocations_this_cycle"] == 2
    recent = body["recent"]
    assert [r["run_id"] for r in recent] == ["run-2", "run-1"]
    assert recent[0]["context"] == "Sprint Planning"
    assert recent[0]["total_usd"] == pytest.approx(2.0)
    run1 = recent[1]
    assert run1["total_usd"] == pytest.approx(1.5)
    assert {m["model"]: m["cost_usd"] for m in run1["models"]} == {
        "gpt-5.4-mini": pytest.approx(1.0),
        "whisper-1": pytest.approx(0.5),
    }


def test_event_without_run_id_is_its_own_invocation(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    _make_usage(db_session, project, cost_usd=1.0)

    resp = client.get(f"/projects/{project.id}/billing", headers=_auth(user.id))
    recent = resp.json()["recent"]
    assert len(recent) == 1
    assert recent[0]["total_usd"] == pytest.approx(1.0)


def test_recent_is_capped_at_six(client, db_session):
    user = _make_user(db_session)
    project = _make_project(db_session, user)
    now = datetime.now(timezone.utc)
    for i in range(8):
        _make_usage(
            db_session, project, run_id=f"run-{i}",
            created_at=now - timedelta(minutes=i),
        )

    resp = client.get(f"/projects/{project.id}/billing", headers=_auth(user.id))
    body = resp.json()
    assert len(body["recent"]) == 6
    assert body["invocations_this_cycle"] == 8
    assert body["recent"][0]["run_id"] == "run-0"


def test_usage_is_per_project(client, db_session):
    user = _make_user(db_session)
    project_a = _make_project(db_session, user, name="A")
    project_b = _make_project(db_session, user, name="B")
    _make_usage(db_session, project_a, cost_usd=4.0)

    resp = client.get(f"/projects/{project_b.id}/billing", headers=_auth(user.id))
    assert resp.json()["cycle"]["mtd_usd"] == 0
