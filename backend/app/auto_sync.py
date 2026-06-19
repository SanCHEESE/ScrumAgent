"""Periodic auto-sync of project backlogs into LightRAG.

`select_due_projects` and `run_due_syncs` are the testable core (collaborators
injected, `now` passed in). `AutoSyncScheduler` is the production seam: a thin
asyncio loop started/stopped in the FastAPI lifespan, overridden/ignored in tests
(like `IngestionRunner`).

Auto-sync reuses the same path as a manual re-sync — `IngestionRun(trigger=auto)`
makes `execute_run` clear-then-reindex, which is required because LightRAG has no
upsert (edited items would otherwise accumulate as orphaned content-hash docs).
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import Settings
from app.ingestion import IngestionRunner
from app.models import Project
from app.models.ingestion import IngestionRun
from app.models.types import IngestionStatus, IngestionTrigger
from app.rag import RagError

logger = logging.getLogger(__name__)

_IN_FLIGHT = (IngestionStatus.pending, IngestionStatus.running)
_SYNCED = (IngestionStatus.completed, IngestionStatus.partial)


def _as_utc(dt: datetime) -> datetime:
    """SQLite returns timezone-aware columns as naive — treat those as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def select_due_projects(
    session: Session, *, now: datetime, interval_hours: float
) -> list[Project]:
    """Projects that should be auto-synced now.

    Due when the project has a Jira or Notion integration, ``auto_sync_enabled``
    is set, no run is currently pending/running (overlap guard), and it has either
    never completed a sync or its last successful sync is older than the interval.
    """
    cutoff = now - timedelta(hours=interval_hours)
    candidates = (
        session.query(Project)
        .filter(
            Project.auto_sync_enabled.is_(True),
            or_(
                Project.jira_project_key.isnot(None),
                Project.notion_page_id.isnot(None),
            ),
        )
        .all()
    )

    due: list[Project] = []
    for project in candidates:
        runs = (
            session.query(IngestionRun)
            .filter(IngestionRun.project_id == project.id)
            .all()
        )
        if any(r.status in _IN_FLIGHT for r in runs):
            continue
        successes = [
            _as_utc(r.finished_at)
            for r in runs
            if r.status in _SYNCED and r.finished_at is not None
        ]
        if not successes or max(successes) <= cutoff:
            due.append(project)
    return due


def run_due_syncs(
    *,
    session_factory: Callable[[], Session],
    runner: IngestionRunner,
    settings: Settings,
    now: datetime,
) -> list[str]:
    """Schedule an auto-sync run for every due project; return the run ids."""
    session = session_factory()
    scheduled: list[str] = []
    try:
        due = select_due_projects(
            session, now=now, interval_hours=settings.rag_auto_sync_interval_hours
        )
        for project in due:
            run = IngestionRun(
                project_id=project.id,
                trigger=IngestionTrigger.auto,
                status=IngestionStatus.pending,
            )
            session.add(run)
            session.commit()
            session.refresh(run)
            runner.schedule(run.id)
            scheduled.append(run.id)
        if scheduled:
            logger.info("auto-sync scheduled %d project(s)", len(scheduled))
    finally:
        session.close()
    return scheduled


@dataclass
class HealState:
    """In-memory throttle for the global reprocess-failed heal (ScrumAgent-clo).

    Resets on process restart — a restart simply re-attempts, which is harmless.
    """

    attempts: int = 0
    last_failed: int = 0


def decide_heal(failed: int, state: HealState, *, max_attempts: int) -> bool:
    """Whether to trigger a `reprocess_failed` now; mutates ``state``.

    - ``failed == 0`` → nothing to heal, reset the episode.
    - ``failed`` dropped since the last attempt → making progress, keep healing
      (reset the attempt counter so progress never burns the budget).
    - no progress → count the attempt and give up once ``attempts`` reaches
      ``max_attempts`` (e.g. docs with no embedding access — don't hammer OpenAI
      forever; they stay visible in the health ``failed`` count).
    """
    if failed <= 0:
        state.attempts = 0
        state.last_failed = 0
        return False
    made_progress = state.last_failed > 0 and failed < state.last_failed
    if made_progress:
        state.attempts = 1
    elif state.attempts >= max_attempts:
        return False
    else:
        state.attempts += 1
    state.last_failed = failed
    return True


async def heal_failed_docs(rag, state: HealState, *, max_attempts: int) -> bool:
    """One heal pass: when LightRAG is idle and has FAILED docs (and the attempt
    budget allows), trigger a global `reprocess_failed` (ScrumAgent-clo).

    Returns ``True`` iff a reprocess was kicked off. Best-effort: any ``RagError``
    is logged and swallowed so a transient LightRAG blip never kills the tick.
    """
    try:
        if await rag.pipeline_busy():
            return False
        failed = await rag.failed_count()
        if not decide_heal(failed, state, max_attempts=max_attempts):
            return False
        await rag.reprocess_failed()
    except RagError as exc:
        logger.warning("auto-heal skipped: %s", exc)
        return False
    logger.info(
        "auto-heal: reprocessing %d failed doc(s) in place (attempt %d/%d)",
        failed,
        state.attempts,
        max_attempts,
    )
    return True


class AutoSyncScheduler:
    """Background loop that periodically heals failed docs and schedules due syncs.

    Thin production seam — the loop body delegates to `heal_failed_docs` and
    `run_due_syncs`. One failed tick is logged and the loop continues.
    """

    def __init__(
        self,
        settings: Settings,
        session_factory: Callable[[], Session],
        runner: IngestionRunner | None = None,
        rag=None,
    ) -> None:
        self._settings = settings
        self._session_factory = session_factory
        self._runner = runner or IngestionRunner(settings, session_factory)
        # Optional heal collaborator. None => auto-heal off (keeps the pure
        # scheduling tests rag-free); production passes a RagBackend.
        self._rag = rag
        self._heal_state = HealState()
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                # Heal first: if there are FAILED docs to reprocess, do that and
                # skip resync this tick — the pipeline is now busy and a resync
                # would only defer (ScrumAgent-clo).
                healed = False
                if self._rag is not None and self._settings.rag_heal_enabled:
                    healed = await heal_failed_docs(
                        self._rag,
                        self._heal_state,
                        max_attempts=self._settings.rag_heal_max_attempts,
                    )
                if not healed:
                    run_due_syncs(
                        session_factory=self._session_factory,
                        runner=self._runner,
                        settings=self._settings,
                        now=datetime.now(timezone.utc),
                    )
            except Exception:  # noqa: BLE001 — one bad tick must not kill the loop
                logger.exception("auto-sync tick failed")
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=self._settings.rag_auto_sync_tick_seconds
                )
            except asyncio.TimeoutError:
                pass

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
