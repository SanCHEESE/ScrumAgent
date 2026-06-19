"""Runtime orchestrator (ScrumAgent-die). Owns run lifecycle, the per-agent
capability allow-list, and trace recording. Agents receive only the services
their allow-list permits; anything else raises CapabilityError."""
from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.orm import Session

from app.models.types import RunStatus, StepKind
from app.repositories import trace as trace_repo
from app.runtime.contracts import CAPABILITIES, AgentName, RunContext

# Mediated handoffs allowed between agents (the only legal agent transitions).
_ALLOWED_HANDOFFS = frozenset({
    (AgentName.user_chat, AgentName.jira_notion),
    (AgentName.meeting_participation, AgentName.jira_notion),
    (AgentName.jira_notion, AgentName.user_chat),
})


class CapabilityError(RuntimeError):
    """An agent reached for a capability outside its allow-list."""


class _GatedRag:
    """RAG handle exposing only the capabilities allow-listed for one agent.
    It is a narrow proxy (allowlist), not a filtered view of the RAG backend — methods
    the agent isn't granted simply don't exist or raise CapabilityError."""
    def __init__(self, rag, allowed: set[str]):
        self._rag = rag
        self._allowed = allowed

    async def retrieve(self, *args, **kwargs):
        if "rag.retrieve" not in self._allowed:
            raise CapabilityError("rag.retrieve not allowed for this agent")
        return await self._rag.retrieve(*args, **kwargs)

    async def index_documents(self, *args, **kwargs):
        if "rag.index" not in self._allowed:
            raise CapabilityError("rag.index not allowed for this agent")
        return await self._rag.index_documents(*args, **kwargs)


class GatedServices:
    def __init__(self, *, rag, llm, allowed: set[str]):
        self.rag = _GatedRag(rag, allowed)
        self.llm = llm if "llm" in allowed else None


class Orchestrator:
    def __init__(self, *, llm, rag, trace_factory: Callable[[], Session]):
        """trace_factory returns the Session to record into; in production it is
        the per-request session (so trace + chat commit together), in tests the
        fixture session."""
        self._llm = llm
        self._rag = rag
        self._trace_factory = trace_factory

    async def start_run(self, entry_agent: AgentName, ctx: RunContext) -> str:
        db = self._trace_factory()
        run = trace_repo.start_run(db, entry_agent=entry_agent.value)
        db.flush()
        ctx.run_id = run.id
        return run.id

    def services_for(self, agent: AgentName, ctx: RunContext) -> GatedServices:
        return GatedServices(rag=self._rag, llm=self._llm, allowed=CAPABILITIES[agent])

    def record(self, run_id: str, agent: AgentName, kind: StepKind,
               input: dict | None, output: dict | None) -> None:
        db = self._trace_factory()
        trace_repo.record_step(db, run_id=run_id, agent=agent.value, kind=kind,
                               input=input, output=output)

    def finish(self, run_id: str, status: RunStatus) -> None:
        db = self._trace_factory()
        trace_repo.finish_run(db, run_id=run_id, status=status)

    async def dispatch_handoff(self, frm: AgentName, to: AgentName, payload: dict):
        """Mediated handoff (mechanism only; unused in the chat slice). Records a
        handoff step; raises if the transition is not in the allowed matrix."""
        if (frm, to) not in _ALLOWED_HANDOFFS:
            raise CapabilityError(f"handoff {frm.value}->{to.value} not allowed")
        self.record(payload["run_id"], frm, StepKind.handoff, {"to": to.value}, None)
