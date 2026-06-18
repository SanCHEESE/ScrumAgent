"""Background ingestion: read Jira/Notion sources and index them into LightRAG.

`execute_run` is the testable core (collaborators injected). `run_ingestion` is the
production entry that builds real clients from a run's project credentials.
`IngestionRunner` is the schedulable seam overridden in tests.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Sequence
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.jira_client import JiraReadClient
from app.models import Project
from app.models.ingestion import IngestionRun
from app.models.types import IngestionStatus, IngestionTrigger
from app.notion_client import NotionReadClient
from app.rag import RagClient, RagDocument
from app.sources import SourceDocument

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_rag(docs: Sequence[SourceDocument]) -> list[RagDocument]:
    return [
        RagDocument(
            text=d.text,
            source_kind=d.source_kind,
            source_id=d.source_id,
            title=d.title,
            source_uri=d.source_uri,
        )
        for d in docs
    ]


async def execute_run(
    run: IngestionRun,
    *,
    session: Session,
    project: Project,
    rag,
    jira_reader=None,
    notion_reader=None,
) -> None:
    run.status = IngestionStatus.running
    run.started_at = _now()
    session.commit()

    if run.trigger in (IngestionTrigger.resync, IngestionTrigger.auto):
        # Resync is destructive (clear-then-reindex). If LightRAG is already busy
        # with another job, don't fight its single-flight pipeline — the bounded
        # idle-wait would just time out and land as a scary `failed`. Defer instead;
        # the scheduler retries on the next tick (ScrumAgent-vw3). A failing probe
        # is treated as "proceed" so a genuinely-down LightRAG still surfaces below.
        try:
            busy = await rag.pipeline_busy()
        except Exception:  # noqa: BLE001 — probe failure must not block the run
            busy = False
        if busy:
            run.status = IngestionStatus.deferred
            run.finished_at = _now()
            session.commit()
            return
        try:
            await rag.clear_project(project.id)
        except Exception as exc:  # noqa: BLE001 — surface as a hard failure
            run.status = IngestionStatus.failed
            run.error = f"clear_project failed: {exc}"
            run.finished_at = _now()
            session.commit()
            return

    failures: list[str] = []

    if jira_reader is not None and project.jira_project_key:
        try:
            docs = await jira_reader.fetch_issues(project.jira_project_key)
            run.jira_total = len(docs)
            result = await rag.index_documents(project.id, _to_rag(docs))
            run.jira_submitted = result.submitted
        except Exception as exc:  # noqa: BLE001 — isolate per source
            logger.warning("jira ingest failed for %s: %s", project.id, exc)
            run.jira_total = run.jira_total or 0
            run.jira_submitted = 0
            failures.append(f"jira: {exc}")

    if notion_reader is not None and project.notion_page_id:
        try:
            docs = await notion_reader.fetch_pages(project.notion_page_id)
            run.notion_total = len(docs)
            result = await rag.index_documents(project.id, _to_rag(docs))
            run.notion_submitted = result.submitted
        except Exception as exc:  # noqa: BLE001 — isolate per source
            logger.warning("notion ingest failed for %s: %s", project.id, exc)
            run.notion_total = run.notion_total or 0
            run.notion_submitted = 0
            failures.append(f"notion: {exc}")

    submitted = (run.jira_submitted or 0) + (run.notion_submitted or 0)
    if failures and submitted == 0:
        run.status = IngestionStatus.failed
    elif failures:
        run.status = IngestionStatus.partial
    else:
        run.status = IngestionStatus.completed
    run.failed_count = len(failures)
    run.errors = failures or None
    run.finished_at = _now()
    session.commit()


async def run_ingestion(
    run_id: str, *, session_factory: Callable[[], Session], settings: Settings
) -> None:
    session = session_factory()
    try:
        run = session.get(IngestionRun, run_id)
        if run is None:
            return
        project = session.get(Project, run.project_id)
        credential = project.credential if project else None
        if project is None or credential is None:
            run.status = IngestionStatus.failed
            run.error = "project or credentials missing"
            run.finished_at = _now()
            session.commit()
            return

        rag = RagClient.from_settings(settings)
        jira_reader = None
        if project.jira_project_key and project.jira_site_url and credential.jira_api_token:
            jira_reader = JiraReadClient(
                project.jira_site_url,
                project.jira_user_email or "",
                credential.jira_api_token,
                page_size=settings.jira_page_size,
            )
        notion_reader = None
        if project.notion_page_id and credential.notion_token:
            notion_reader = NotionReadClient(
                credential.notion_token, max_depth=settings.notion_max_depth
            )
        await execute_run(
            run,
            session=session,
            project=project,
            rag=rag,
            jira_reader=jira_reader,
            notion_reader=notion_reader,
        )
    except Exception:  # noqa: BLE001 — never let a background crash go silent
        logger.exception("ingestion run %s crashed", run_id)
        run = session.get(IngestionRun, run_id)
        if run is not None and run.status in (
            IngestionStatus.pending,
            IngestionStatus.running,
        ):
            run.status = IngestionStatus.failed
            run.error = "unexpected error"
            run.finished_at = _now()
            session.commit()
    finally:
        session.close()


class IngestionRunner:
    """Schedules background ingestion. Overridden in tests to assert enqueue only."""

    def __init__(self, settings: Settings, session_factory: Callable[[], Session]) -> None:
        self._settings = settings
        self._session_factory = session_factory
        self._tasks: set[asyncio.Task] = set()

    def schedule(self, run_id: str) -> None:
        task = asyncio.create_task(
            run_ingestion(
                run_id, session_factory=self._session_factory, settings=self._settings
            )
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
