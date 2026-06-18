from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.auto_sync import (
    AutoSyncScheduler,
    HealState,
    decide_heal,
    heal_failed_docs,
    run_due_syncs,
    select_due_projects,
)
from app.rag import RagError
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


# --- Auto-heal: reprocess failed docs in place (ScrumAgent-clo) ---


def test_decide_heal_triggers_when_failed_and_no_history():
    state = HealState()
    assert decide_heal(5, state, max_attempts=3) is True
    assert state.attempts == 1
    assert state.last_failed == 5


def test_decide_heal_skips_and_resets_when_nothing_failed():
    state = HealState(attempts=2, last_failed=5)
    assert decide_heal(0, state, max_attempts=3) is False
    # episode reset so a fresh failure starts a clean attempt budget
    assert state.attempts == 0
    assert state.last_failed == 0


def test_decide_heal_keeps_going_while_failed_count_drops():
    state = HealState()
    assert decide_heal(100, state, max_attempts=3) is True  # attempt 1
    assert decide_heal(40, state, max_attempts=3) is True   # progress -> stays attempt 1
    assert state.attempts == 1
    assert decide_heal(10, state, max_attempts=3) is True   # still progress
    assert state.attempts == 1


def test_decide_heal_gives_up_after_max_attempts_without_progress():
    state = HealState()
    # Same failed count every round = no progress. N reprocesses, then give up.
    assert decide_heal(7, state, max_attempts=3) is True   # attempt 1
    assert decide_heal(7, state, max_attempts=3) is True   # attempt 2
    assert decide_heal(7, state, max_attempts=3) is True   # attempt 3
    assert decide_heal(7, state, max_attempts=3) is False  # budget exhausted
    assert state.attempts == 3


class FakeHealRag:
    """Minimal RagClient stand-in for the heal step (only the 3 methods it uses)."""

    def __init__(self, *, busy=False, failed=0):
        self._busy = busy
        self._failed = failed
        self.reprocessed = 0

    async def pipeline_busy(self):
        return self._busy

    async def failed_count(self):
        return self._failed

    async def reprocess_failed(self):
        self.reprocessed += 1


def test_heal_reprocesses_when_idle_and_failed():
    rag = FakeHealRag(busy=False, failed=4)
    state = HealState()
    assert asyncio.run(heal_failed_docs(rag, state, max_attempts=3)) is True
    assert rag.reprocessed == 1


def test_heal_skips_when_pipeline_busy():
    rag = FakeHealRag(busy=True, failed=4)
    state = HealState()
    assert asyncio.run(heal_failed_docs(rag, state, max_attempts=3)) is False
    assert rag.reprocessed == 0
    assert state.attempts == 0  # busy -> never consulted decide_heal


def test_heal_skips_when_no_failed_docs():
    rag = FakeHealRag(busy=False, failed=0)
    state = HealState()
    assert asyncio.run(heal_failed_docs(rag, state, max_attempts=3)) is False
    assert rag.reprocessed == 0


def test_heal_gives_up_after_repeated_failure():
    rag = FakeHealRag(busy=False, failed=5)  # never drops -> permanent failure
    state = HealState()
    results = [
        asyncio.run(heal_failed_docs(rag, state, max_attempts=3)) for _ in range(5)
    ]
    assert results == [True, True, True, False, False]
    assert rag.reprocessed == 3  # bounded — no infinite OpenAI hammering


class _BoomRag(FakeHealRag):
    async def failed_count(self):
        raise RagError("status_counts unreachable")


def test_heal_swallows_ragerror():
    rag = _BoomRag(busy=False, failed=4)
    state = HealState()
    # A LightRAG blip must not raise out of the scheduler tick.
    assert asyncio.run(heal_failed_docs(rag, state, max_attempts=3)) is False
    assert rag.reprocessed == 0


def _heal_settings(**over):
    base = dict(
        rag_auto_sync_interval_hours=6,
        rag_auto_sync_tick_seconds=0.05,
        rag_heal_enabled=True,
        rag_heal_max_attempts=3,
    )
    base.update(over)
    return SimpleNamespace(**base)


def test_scheduler_heals_and_skips_resync_on_that_tick():
    factory = _factory()
    _project(factory(), sub="due")  # never synced -> would be due for resync
    runner = FakeRunner()
    rag = FakeHealRag(busy=False, failed=3)
    scheduler = AutoSyncScheduler(_heal_settings(), factory, runner=runner, rag=rag)

    async def _drive():
        await scheduler.start()
        await asyncio.sleep(0.02)
        await scheduler.stop()

    asyncio.run(_drive())
    assert rag.reprocessed >= 1     # healed the failed docs
    assert runner.scheduled == []   # destructive resync skipped while healing


def test_scheduler_runs_resync_when_nothing_to_heal():
    factory = _factory()
    _project(factory(), sub="due")
    runner = FakeRunner()
    rag = FakeHealRag(busy=False, failed=0)  # nothing failed
    scheduler = AutoSyncScheduler(_heal_settings(), factory, runner=runner, rag=rag)

    async def _drive():
        await scheduler.start()
        await asyncio.sleep(0.02)
        await scheduler.stop()

    asyncio.run(_drive())
    assert rag.reprocessed == 0      # nothing to heal
    assert len(runner.scheduled) >= 1  # normal resync proceeds undisturbed
