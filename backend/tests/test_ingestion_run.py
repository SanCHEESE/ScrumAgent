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
    def __init__(self, docs): self._docs = docs
    async def fetch_issues(self, project_key): return self._docs


class FakeNotion:
    def __init__(self, docs): self._docs = docs
    async def fetch_pages(self, root): return self._docs


class FakeRag:
    def __init__(self): self.cleared = []
    async def clear_project(self, pid): self.cleared.append(pid); return 0
    async def index_documents(self, pid, docs): return IndexResult(submitted=len(list(docs)), track_id="t")


class ExplodingRag(FakeRag):
    async def index_documents(self, pid, docs): raise RagError("down")


def _doc(i):
    return SourceDocument(source_kind="jira", source_id=f"K-{i}", title="t", text="b", source_uri="u")


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
