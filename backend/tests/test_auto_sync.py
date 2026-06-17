from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.auto_sync import AutoSyncScheduler, run_due_syncs, select_due_projects
from app.database import init_db, make_engine
from app.models import Project
from app.models.ingestion import IngestionRun
from app.models.types import IngestionStatus, IngestionTrigger
from app.models.user import User
from app.security import crypto
from sqlalchemy.orm import sessionmaker

NOW = datetime(2026, 6, 17, 12, 0, tzinfo=timezone.utc)


def _factory():
    crypto.configure("test-secret")
    engine = make_engine("sqlite://")
    init_db(engine)
    return sessionmaker(bind=engine, autoflush=False, future=True)


def _user(db, sub):
    u = User(google_sub=sub, email=f"{sub}@municorn.com", name="T")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _project(db, *, jira=True, notion=False, enabled=True, sub="s"):
    u = _user(db, sub)
    p = Project(
        owner_id=u.id,
        name="P",
        agent_email="a@municorn.com",
        google_connected=True,
        jira_project_key="PLAT" if jira else None,
        notion_page_id="abc" if notion else None,
        auto_sync_enabled=enabled,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _run(db, project, *, status, finished_at=None, trigger=IngestionTrigger.auto):
    run = IngestionRun(
        project_id=project.id, trigger=trigger, status=status, finished_at=finished_at
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _ids(projects):
    return {p.id for p in projects}


def test_never_synced_project_is_due():
    db = _factory()()
    p = _project(db)
    assert _ids(select_due_projects(db, now=NOW, interval_hours=6)) == {p.id}


def test_recently_synced_project_not_due():
    db = _factory()()
    p = _project(db)
    _run(db, p, status=IngestionStatus.completed, finished_at=NOW - timedelta(hours=1))
    assert select_due_projects(db, now=NOW, interval_hours=6) == []


def test_stale_synced_project_is_due():
    db = _factory()()
    p = _project(db)
    _run(db, p, status=IngestionStatus.completed, finished_at=NOW - timedelta(hours=7))
    assert _ids(select_due_projects(db, now=NOW, interval_hours=6)) == {p.id}


def test_partial_run_counts_as_synced():
    db = _factory()()
    p = _project(db)
    _run(db, p, status=IngestionStatus.partial, finished_at=NOW - timedelta(hours=1))
    assert select_due_projects(db, now=NOW, interval_hours=6) == []


def test_failed_only_project_is_due():
    db = _factory()()
    p = _project(db)
    # A failed sync isn't a success — it should be retried on the next tick.
    _run(db, p, status=IngestionStatus.failed, finished_at=NOW - timedelta(hours=1))
    assert _ids(select_due_projects(db, now=NOW, interval_hours=6)) == {p.id}


def test_disabled_project_not_due():
    db = _factory()()
    _project(db, enabled=False)
    assert select_due_projects(db, now=NOW, interval_hours=6) == []


def test_project_without_integration_not_due():
    db = _factory()()
    _project(db, jira=False, notion=False)
    assert select_due_projects(db, now=NOW, interval_hours=6) == []


def test_in_flight_project_skipped():
    db = _factory()()
    p = _project(db)
    # Stale success, but a run is currently in progress — skip to avoid overlap.
    _run(db, p, status=IngestionStatus.completed, finished_at=NOW - timedelta(hours=8))
    _run(db, p, status=IngestionStatus.running, finished_at=None)
    assert select_due_projects(db, now=NOW, interval_hours=6) == []


class FakeRunner:
    def __init__(self):
        self.scheduled: list[str] = []

    def schedule(self, run_id: str) -> None:
        self.scheduled.append(run_id)


def test_run_due_syncs_schedules_auto_runs_for_due_projects_only():
    factory = _factory()
    db = factory()
    due_p = _project(db, sub="due")
    fresh_p = _project(db, sub="fresh")
    _run(db, fresh_p, status=IngestionStatus.completed, finished_at=NOW - timedelta(hours=1))

    runner = FakeRunner()
    settings = SimpleNamespace(rag_auto_sync_interval_hours=6)
    scheduled = run_due_syncs(
        session_factory=factory, runner=runner, settings=settings, now=NOW
    )

    assert runner.scheduled == scheduled
    assert len(scheduled) == 1
    db.expire_all()
    due_runs = (
        db.query(IngestionRun).filter(IngestionRun.project_id == due_p.id).all()
    )
    assert len(due_runs) == 1
    assert due_runs[0].trigger == IngestionTrigger.auto
    assert due_runs[0].status == IngestionStatus.pending
    assert due_runs[0].id == scheduled[0]
    # The freshly-synced project gets no new run (still just its seed run).
    assert (
        db.query(IngestionRun).filter(IngestionRun.project_id == fresh_p.id).count()
        == 1
    )


def test_scheduler_runs_a_tick_then_stops_cleanly():
    factory = _factory()
    _project(factory(), sub="due")  # never synced -> due
    runner = FakeRunner()
    settings = SimpleNamespace(
        rag_auto_sync_interval_hours=6, rag_auto_sync_tick_seconds=0.05
    )
    scheduler = AutoSyncScheduler(settings, factory, runner=runner)

    async def _drive():
        await scheduler.start()
        await asyncio.sleep(0.01)  # let the first tick run
        await scheduler.stop()

    asyncio.run(_drive())
    assert len(runner.scheduled) >= 1
