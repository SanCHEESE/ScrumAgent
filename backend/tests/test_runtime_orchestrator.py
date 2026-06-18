from __future__ import annotations

from app.runtime.contracts import AgentName, CAPABILITIES, RunContext


def test_capability_matrix_user_chat_is_read_only():
    caps = CAPABILITIES[AgentName.user_chat]
    assert "rag.retrieve" in caps and "llm" in caps
    assert "rag.index" not in caps
    assert not any(c.startswith("mcp") for c in caps)


def test_run_context_holds_scope():
    ctx = RunContext(project_id="p1", user_id=7, conversation_id="c1", run_id="r1")
    assert ctx.project_id == "p1" and ctx.user_id == 7


import asyncio

from app.models.types import RunStatus, StepKind
from app.repositories import trace as trace_repo
from app.runtime.contracts import AgentName, RunContext
from app.runtime.orchestrator import CapabilityError, Orchestrator


class _FakeRag:
    async def retrieve(self, *a, **k):
        return []
    async def index_documents(self, *a, **k):
        return None


def _orch(db_session):
    return Orchestrator(llm=object(), rag=_FakeRag(), trace_factory=lambda: db_session)


def test_start_run_records_trace_run(db_session):
    orch = _orch(db_session)
    ctx = RunContext(project_id="p1", user_id=1, conversation_id=None, run_id="")
    run_id = asyncio.run(orch.start_run(AgentName.user_chat, ctx))
    db_session.commit()
    run = trace_repo.get_run(db_session, run_id)
    assert run.entry_agent == "user_chat" and run.status == RunStatus.running


def test_user_chat_services_expose_only_retrieve_and_llm(db_session):
    orch = _orch(db_session)
    ctx = RunContext(project_id="p1", user_id=1, conversation_id=None, run_id="r")
    svc = orch.services_for(AgentName.user_chat, ctx)
    assert hasattr(svc.rag, "retrieve")
    with __import__("pytest").raises(CapabilityError):
        svc.rag.index_documents("p1", [])


def test_record_step_writes_through_orchestrator(db_session):
    orch = _orch(db_session)
    ctx = RunContext(project_id="p1", user_id=1, conversation_id=None, run_id="")
    run_id = asyncio.run(orch.start_run(AgentName.user_chat, ctx))
    orch.record(run_id, AgentName.user_chat, StepKind.tool, {"q": "x"}, {"n": 0})
    db_session.commit()
    steps = trace_repo.list_steps(db_session, run_id)
    assert steps[0].kind == StepKind.tool
