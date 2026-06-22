from __future__ import annotations

import asyncio

from app.database import init_db, make_engine
from app.ingestion import execute_run
from app.models import Project, ProjectCredential
from app.models.ingestion import IngestionRun
from app.models.types import IngestionStatus, IngestionTrigger, ProjectRole
from app.models.user import User
from app.rag import IndexResult, RagError
from app.security import crypto
from app.sources import SourceDocument
from sqlalchemy.orm import sessionmaker


def _session():
    crypto.configure("test-secret")
    engine = make_engine("sqlite://")
    init_db(engine)
    return sessionmaker(bind=engine, autoflush=False, future=True)()


def _make_user(db) -> User:
    user = User(google_sub="sub-test", email="a@municorn.com", name="Test")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _project(db, *, with_jira=False, with_notion=False) -> Project:
    user = _make_user(db)
    project = Project(
        owner_id=user.id, name="P", agent_email="a@municorn.com", google_connected=True,
        jira_site_url="https://m.atlassian.net" if with_jira else None,
        jira_user_email="a@municorn.com" if with_jira else None,
        jira_project_key="PLAT" if with_jira else None,
        notion_page_id="abc" if with_notion else None,
    )
    project.credential = ProjectCredential(
        google_refresh_token="rt",
        jira_api_token="t" if with_jira else None,
        notion_token="t" if with_notion else None,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


class FakeJira:
    def __init__(self, docs, *, index=None):
        self._docs = docs
        self._index = index or {}
    async def fetch_issues(self, project_key, *, updated_since=None):
        if updated_since is None:
            return self._docs
        return [d for d in self._docs if d.updated_at and d.updated_at >= updated_since]
    async def fetch_issue_index(self, project_key):
        return dict(self._index)


class FakeNotion:
    def __init__(self, docs): self._docs = docs
    async def fetch_pages(self, root): return self._docs


class FakeRag:
    def __init__(self):
        self.cleared = []; self.indexed = []; self.cleared_sources = []
        self.source_ids = set()                      # what list_source_ids returns
    async def pipeline_busy(self): return False
    async def clear_project(self, pid): self.cleared.append(pid); return 0
    async def clear_source(self, pid, kind, sid):
        self.cleared_sources.append((kind, sid)); return 1
    async def list_source_ids(self, pid): return set(self.source_ids)
    async def index_documents(self, pid, docs):
        self.indexed.append(pid)
        return IndexResult(submitted=len(list(docs)), track_id="t")


class ExplodingRag(FakeRag):
    async def index_documents(self, pid, docs): raise RagError("down")


class BusyRag(FakeRag):
    """LightRAG reports another job already in flight."""
    async def pipeline_busy(self): return True


def _doc(i, updated=None):
    return SourceDocument(source_kind="jira", source_id=f"K-{i}", title="t",
                          text="b", source_uri="u", updated_at=updated)


def _run(db, project, trigger=IngestionTrigger.created):
    run = IngestionRun(project_id=project.id, trigger=trigger, status=IngestionStatus.pending)
    db.add(run); db.commit(); db.refresh(run)
    return run


def test_completed_when_all_sources_index():
    db = _session()
    project = _project(db, with_jira=True, with_notion=True)
    run = _run(db, project)
    rag = FakeRag()
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        jira_reader=FakeJira([_doc(1), _doc(2)]), notion_reader=FakeNotion([_doc(3)]),
    ))
    assert run.status == IngestionStatus.completed
    assert run.jira_total == 2 and run.jira_submitted == 2
    assert run.notion_total == 1 and run.notion_submitted == 1
    assert run.failed_count == 0
    assert run.started_at is not None and run.finished_at is not None


def test_partial_when_one_source_fails():
    db = _session()
    project = _project(db, with_jira=True, with_notion=True)
    run = _run(db, project)

    class HalfRag(FakeRag):
        def __init__(self): super().__init__(); self.n = 0
        async def index_documents(self, pid, docs):
            self.n += 1
            if self.n == 1:
                raise RagError("jira down")
            return IndexResult(submitted=len(list(docs)))

    asyncio.run(execute_run(
        run, session=db, project=project, rag=HalfRag(),
        jira_reader=FakeJira([_doc(1)]), notion_reader=FakeNotion([_doc(2)]),
    ))
    assert run.status == IngestionStatus.partial
    assert run.failed_count == 1
    assert run.errors and any("jira" in e for e in run.errors)


def test_failed_when_nothing_submitted():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=ExplodingRag(), jira_reader=FakeJira([_doc(1)]),
    ))
    assert run.status == IngestionStatus.failed


def test_resync_clears_before_indexing():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project, trigger=IngestionTrigger.resync)
    rag = FakeRag()
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag, jira_reader=FakeJira([_doc(1)]),
    ))
    assert rag.cleared == [project.id]
    assert run.status == IngestionStatus.completed


def test_auto_clears_before_indexing():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project, trigger=IngestionTrigger.auto)
    rag = FakeRag()
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag, jira_reader=FakeJira([_doc(1)]),
    ))
    # Auto-sync must clear-then-reindex like resync — LightRAG has no upsert, so
    # edited items would otherwise pile up as orphaned content-hash docs.
    assert rag.cleared == [project.id]
    assert run.status == IngestionStatus.completed


def test_resync_deferred_when_pipeline_busy():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project, trigger=IngestionTrigger.resync)
    rag = BusyRag()
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag, jira_reader=FakeJira([_doc(1)]),
    ))
    # A destructive resync must NOT fight an in-flight LightRAG job: no clear, no
    # index, and a soft `deferred` (not a scary `failed`) so the scheduler retries.
    assert run.status == IngestionStatus.deferred
    assert rag.cleared == [] and rag.indexed == []
    assert run.error is None
    assert run.finished_at is not None


def test_auto_deferred_when_pipeline_busy():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project, trigger=IngestionTrigger.auto)
    rag = BusyRag()
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag, jira_reader=FakeJira([_doc(1)]),
    ))
    assert run.status == IngestionStatus.deferred
    assert rag.cleared == [] and rag.indexed == []


def test_created_ignores_busy_pipeline():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project, trigger=IngestionTrigger.created)
    rag = BusyRag()
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag, jira_reader=FakeJira([_doc(1)]),
    ))
    # First-time indexing never clears and must not defer on a busy probe — it
    # only ever runs when the pipeline is expected idle.
    assert run.status == IngestionStatus.completed
    assert rag.indexed == [project.id] and rag.cleared == []


def test_full_run_seeds_jira_watermark():
    from datetime import datetime, timezone
    from app.models import ProjectSyncState
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project, trigger=IngestionTrigger.created)
    older = datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 5, 9, 0, tzinfo=timezone.utc)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=FakeRag(),
        jira_reader=FakeJira([_doc(1, older), _doc(2, newer)]),
    ))
    state = db.get(ProjectSyncState, project.id)
    assert state is not None
    assert state.jira_synced_until == newer.replace(tzinfo=None)


def test_ingestion_run_has_deleted_counters():
    db = _session()
    project = _project(db, with_jira=True)
    run = _run(db, project)
    assert run.jira_deleted is None
    assert run.notion_deleted is None
    run.jira_deleted = 3
    db.commit(); db.refresh(run)
    assert run.jira_deleted == 3
    run.notion_deleted = 5
    db.commit(); db.refresh(run)
    assert run.notion_deleted == 5


def test_auto_incremental_indexes_only_changed():
    from datetime import datetime, timezone
    from app.models import ProjectSyncState
    db = _session()
    project = _project(db, with_jira=True)
    wm = datetime(2026, 6, 3, 0, 0, tzinfo=timezone.utc)
    db.add(ProjectSyncState(project_id=project.id, jira_synced_until=wm)); db.commit()
    db.expire_all()  # force re-read from SQLite so watermark comes back tz-naive

    older = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 5, 0, 0, tzinfo=timezone.utc)
    rag = FakeRag()
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        jira_reader=FakeJira(
            [_doc(1, older), _doc(2, newer)],
            index={"K-1": older, "K-2": newer},
        ),
    ))
    # incremental: no clear_project; only the changed (newer) doc re-indexed
    assert rag.cleared == []
    assert ("jira", "K-2") in rag.cleared_sources
    assert ("jira", "K-1") not in rag.cleared_sources
    assert run.jira_total == 1 and run.jira_submitted == 1
    state = db.get(ProjectSyncState, project.id)
    assert state.jira_synced_until == newer.replace(tzinfo=None)   # advanced to max over full index
    assert run.jira_deleted == 0
    assert run.notion_deleted is None


def test_auto_without_watermark_falls_back_to_full():
    db = _session()
    project = _project(db, with_jira=True)        # no ProjectSyncState row
    rag = FakeRag()
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        jira_reader=FakeJira([_doc(1)], index={"K-1": None}),
    ))
    assert rag.cleared == [project.id]             # cold start = full destructive run
    assert run.status == IngestionStatus.completed


def test_auto_incremental_notion_indexes_only_changed():
    """Notion incremental path: tz-aware docs, only those >= watermark are re-indexed."""
    from datetime import datetime, timezone
    from app.models import ProjectSyncState
    db = _session()
    project = _project(db, with_notion=True)
    wm = datetime(2026, 6, 3, 0, 0, tzinfo=timezone.utc)
    db.add(ProjectSyncState(project_id=project.id, notion_synced_until=wm)); db.commit()
    db.expire_all()  # force re-read from SQLite so watermark comes back tz-naive

    older = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 5, 0, 0, tzinfo=timezone.utc)

    class FakeNotionWithDates:
        def __init__(self, docs): self._docs = docs
        async def fetch_pages(self, root): return self._docs

    old_doc = SourceDocument(source_kind="notion", source_id="page-1", title="t",
                             text="b", source_uri="u", updated_at=older)
    new_doc = SourceDocument(source_kind="notion", source_id="page-2", title="t",
                             text="b", source_uri="u", updated_at=newer)

    rag = FakeRag()
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        notion_reader=FakeNotionWithDates([old_doc, new_doc]),
    ))
    # No TypeError from tz-aware vs tz-naive comparison; only changed doc re-indexed
    assert rag.cleared == []
    assert ("notion", "page-2") in rag.cleared_sources
    assert ("notion", "page-1") not in rag.cleared_sources
    assert run.notion_total == 1 and run.notion_submitted == 1
    state = db.get(ProjectSyncState, project.id)
    assert state.notion_synced_until == newer.replace(tzinfo=None)  # advanced
    assert run.jira_deleted is None
    assert run.notion_deleted == 0


def test_auto_incremental_reconciles_deletions():
    from datetime import datetime, timezone
    from app.models import ProjectSyncState
    db = _session()
    project = _project(db, with_jira=True)
    wm = datetime(2026, 6, 3, 0, 0, tzinfo=timezone.utc)
    db.add(ProjectSyncState(project_id=project.id, jira_synced_until=wm)); db.commit()

    rag = FakeRag()
    # RAG still holds K-1 and a stale K-9; the source only knows K-1 now.
    rag.source_ids = {("jira", "K-1"), ("jira", "K-9")}
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag,
        jira_reader=FakeJira([], index={"K-1": wm}),     # nothing changed; K-9 gone
    ))
    assert ("jira", "K-9") in rag.cleared_sources        # stale doc removed
    assert ("jira", "K-1") not in rag.cleared_sources    # still present, not touched
    assert run.jira_deleted == 1


def test_incremental_jira_outage_does_not_delete_or_advance():
    from datetime import datetime, timezone
    from app.models import ProjectSyncState

    class OutageJira:
        async def fetch_issue_index(self, project_key):
            raise RagError("jira 503")
        async def fetch_issues(self, project_key, *, updated_since=None):  # pragma: no cover
            raise AssertionError("must not fetch bodies after index scan failed")

    db = _session()
    project = _project(db, with_jira=True)
    wm = datetime(2026, 6, 3, 0, 0, tzinfo=timezone.utc)
    db.add(ProjectSyncState(project_id=project.id, jira_synced_until=wm)); db.commit()
    db.expire_all()  # force re-read from SQLite so watermark comes back tz-naive

    rag = FakeRag()
    rag.source_ids = {("jira", "K-1")}      # would all look "deleted" on an empty fetch
    run = _run(db, project, trigger=IngestionTrigger.auto)
    asyncio.run(execute_run(
        run, session=db, project=project, rag=rag, jira_reader=OutageJira(),
    ))
    assert rag.cleared_sources == []                 # nothing deleted on outage
    assert run.jira_deleted is None                  # never reached the deletion step
    assert run.status == IngestionStatus.failed      # the only source failed
    state = db.get(ProjectSyncState, project.id)
    assert state.jira_synced_until == wm.replace(tzinfo=None)  # watermark unchanged (SQLite tz-naive)
