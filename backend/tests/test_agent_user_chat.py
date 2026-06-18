from __future__ import annotations

import asyncio

from app.agents.user_chat import CitationsEvent, TokenEvent, run
from app.rag import Citation, RetrievedPassage
from app.runtime.contracts import RunContext


class _Svc:
    def __init__(self, passages, deltas):
        self._passages = passages
        self._deltas = deltas
        self.llm_calls = 0
        self.seen_system = None

    @property
    def rag(self):
        outer = self
        class R:
            async def retrieve(self, project_id, question, *, k=6):
                return outer._passages
        return R()

    @property
    def llm(self):
        outer = self
        class L:
            async def stream_chat(self, messages, *, system=None, **kw):
                outer.llm_calls += 1
                outer.seen_system = system
                for d in outer._deltas:
                    yield d
        return L()


def _drain(gen):
    async def go():
        return [e async for e in gen]
    return asyncio.run(go())


def _ctx():
    return RunContext(project_id="p1", user_id=1, conversation_id="c1", run_id="r1")


def test_pipeline_retrieves_then_streams_then_citations():
    passages = [
        RetrievedPassage(text="Login fails", score=0.9,
                         citation=Citation("jira", "PLAT-12", "Login", "http://j/PLAT-12")),
    ]
    svc = _Svc(passages, ["Because", " of X."])
    events = _drain(run(_ctx(), message="why?", history=[], services=svc))
    tokens = [e.delta for e in events if isinstance(e, TokenEvent)]
    cites = [e for e in events if isinstance(e, CitationsEvent)]
    assert "".join(tokens) == "Because of X."
    assert cites and cites[0].items[0]["n"] == 1
    assert cites[0].items[0]["source_id"] == "PLAT-12"
    assert "only" in svc.seen_system.lower()


def test_empty_context_yields_fixed_message_and_no_llm_call():
    svc = _Svc([], ["should not be used"])
    events = _drain(run(_ctx(), message="unknown", history=[], services=svc))
    tokens = "".join(e.delta for e in events if isinstance(e, TokenEvent))
    assert "knowledge base" in tokens.lower()
    assert svc.llm_calls == 0
    cites = [e for e in events if isinstance(e, CitationsEvent)]
    assert cites[0].items == []
