# user_chat — RAG-grounded streaming chat: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project-scoped chat that answers only from the RAG knowledge base, streams the answer with inline citations over SSE, persists private resumable conversations, and lets the user push good answers back into the index via a Remember button.

**Architecture:** App-owned runtime orchestrator (documented `runtime/` contract — capability allow-list, trace, handoff mechanism) drives a single deterministic `user_chat` pipeline (`retrieve → grounded prompt → llm.stream`). No `deepagents`/`langgraph`. Backend access to LightRAG/OpenAI stays behind `rag.py` / `llm.py`. Frontend reuses the existing `ChatScreen` mock UI, swapping the `setTimeout` simulation for a real `fetch`-stream SSE client.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (SQLite local / Postgres prod), httpx, `langchain-openai`, pytest (+ `httpx.MockTransport`, `TestClient`), Next.js 14 / React, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-18-user-chat-rag-streaming-design.md`
**bd issues:** `o39` (retrieve), `wqj` (llm), `a27` (trace repo), `die` (orchestrator), `n6h` (user_chat), `2jb` (chat router slice), `n15` (Remember), `r0k` (frontend slice).

**Conventions for every backend task:** run tests from `backend/` with `python -m pytest` (in agent sessions prefix with `rtk`). Each task ends with a code commit (beads auto-commits issue state separately). Claim the bd issue (`bd update <id> --claim`) when starting a phase, close it (`bd close <id>`) when its tasks are done.

---

## File Structure

**Backend — create:**
- `backend/app/llm.py` — `LlmGateway`: streaming OpenAI wrapper + per-call `LlmUsage` logging.
- `backend/app/repositories/trace.py` — trace run/step read+write helpers.
- `backend/app/runtime/__init__.py`
- `backend/app/runtime/contracts.py` — `AgentName`, `RunMode`, `RunContext`, `HandoffTarget`, `CAPABILITIES`.
- `backend/app/runtime/orchestrator.py` — `Orchestrator`, `GatedServices`, `CapabilityError`.
- `backend/app/agents/__init__.py`
- `backend/app/agents/user_chat.py` — deterministic chat pipeline + event types.
- `backend/app/routers/chat.py` — SSE chat, conversation history, remember.
- `backend/app/schemas/chat.py` — request/response Pydantic models (or inline in router if `schemas/` absent).
- Tests: `backend/tests/test_llm_gateway.py`, `test_repositories_trace.py`, `test_runtime_orchestrator.py`, `test_agent_user_chat.py`, `test_chat_api.py`.

**Backend — modify:**
- `backend/app/rag.py` — add `retrieve()`, `clear_source()`, `Citation`, `RetrievedPassage`.
- `backend/app/config.py` — add `openai_chat_model`.
- `backend/app/models/chat.py` — add `Conversation.project_id`.
- `backend/app/repositories/chat.py` — `create_conversation(project_id=…)`, `list_conversations(...)`.
- `backend/app/deps.py` — `get_rag_client`, `get_llm_gateway`, `get_orchestrator`.
- `backend/app/main.py` — register `chat.router`.
- `backend/requirements.txt` — add `langchain-openai`.
- `backend/tests/test_rag_adapter.py`, `test_models_chat.py`, `test_repositories_chat.py` — extend.

**Frontend — modify:**
- `apps/web/lib/api.ts` — add chat client methods + types.
- `apps/web/lib/chat-stream.ts` (create) — `fetch`-based SSE reader.
- `apps/web/components/screens/chat/ChatScreen.tsx` — real streaming, project_id, resumable history.
- `apps/web/components/screens/chat/ChatMessage.tsx` — citations + Remember button.
- `apps/web/components/screens/chat/ChatHistoryPane.tsx` — real conversations.

---

## Phase 1 — Foundation (RAG retrieve, LLM gateway, trace repo)

Independent units; can be built in parallel. Claim: `bd update ScrumAgent-o39 --claim` etc.

### Task 1: `rag.retrieve()` — project-scoped retrieval with citations (`o39`)

**Files:**
- Modify: `backend/app/rag.py`
- Test: `backend/tests/test_rag_adapter.py`

- [ ] **Step 0 (spike — the one real risk): confirm LightRAG v1.5.3 `/query` context-only shape**

Against the running LightRAG (`ScrumAgent-qjh` compose service) confirm the response shape of a context-only query:

```bash
curl -s http://localhost:9621/query -H 'Content-Type: application/json' \
  -d '{"query":"test","mode":"mix","top_k":3,"only_need_context":true}' | python -m json.tool
```

Record the field that carries retrieved chunks and whether each chunk exposes `file_path` and a score. The test + parser below assume each chunk is an object with `content` + `file_path` (+ optional `score`). If v1.5.3 returns an assembled context **string** instead, adjust the parser to extract per-reference `file_path` and reject chunks without one (uncited → dropped). Everything downstream depends only on `retrieve()`'s output contract, not LightRAG's field names.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_rag_adapter.py`:

```python
from app.rag import Citation, RetrievedPassage  # extend the existing import line


def _query_handler(chunks):
    """Serve POST /query (context-only) returning the given chunk dicts."""
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/query"
        import json
        body = json.loads(httpx.Request("POST", request.url, content=request.content).read())
        assert body["only_need_context"] is True
        assert body["top_k"] == 4
        return httpx.Response(200, json={"data": {"chunks": chunks}})
    return handler


def test_retrieve_returns_passages_with_parsed_citations():
    chunks = [
        {"content": "Login fails on mobile.", "file_path": "proj-1::jira::PLAT-12", "score": 0.91},
        {"content": "Release notes v2.", "file_path": "proj-1::notion::page-7", "score": 0.72},
    ]
    out = asyncio.run(_client(_query_handler(chunks)).retrieve("proj-1", "why login fails", k=4))
    assert [type(p) for p in out] == [RetrievedPassage, RetrievedPassage]
    assert out[0].text == "Login fails on mobile."
    assert out[0].score == 0.91
    assert out[0].citation == Citation(source_kind="jira", source_id="PLAT-12", title=None, source_uri=None)
    assert out[1].citation.source_kind == "notion"


def test_retrieve_drops_cross_project_and_uncited_hits():
    chunks = [
        {"content": "mine", "file_path": "proj-1::jira::A", "score": 0.9},
        {"content": "other project", "file_path": "proj-2::jira::B", "score": 0.95},  # leak
        {"content": "no provenance", "file_path": "", "score": 0.8},                  # uncited
    ]
    out = asyncio.run(_client(_query_handler(chunks)).retrieve("proj-1", "q", k=4))
    assert [p.text for p in out] == ["mine"]


def test_retrieve_empty_on_no_hits():
    out = asyncio.run(_client(_query_handler([])).retrieve("proj-1", "q", k=4))
    assert out == []


def test_retrieve_raises_ragerror_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"detail": "boom"})
    try:
        asyncio.run(_client(handler).retrieve("proj-1", "q"))
        raise AssertionError("expected RagError")
    except RagError:
        pass
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_rag_adapter.py::test_retrieve_returns_passages_with_parsed_citations -v
```
Expected: FAIL — `cannot import name 'Citation'` / `RagClient has no attribute 'retrieve'`.

- [ ] **Step 3: Implement in `backend/app/rag.py`**

Add the dataclasses near the other dataclasses:

```python
@dataclass(frozen=True)
class Citation:
    source_kind: str
    source_id: str
    title: str | None = None
    source_uri: str | None = None


@dataclass
class RetrievedPassage:
    text: str
    score: float
    citation: Citation


def _parse_citation(file_path: str) -> Citation | None:
    """`file_path` is "{project_id}::{kind}::{id}"; None if it has no usable kind/id."""
    parts = file_path.split("::")
    if len(parts) < 3 or not parts[1] or not parts[2]:
        return None
    return Citation(source_kind=parts[1], source_id=parts[2])
```

Add the method to `RagClient` (query is read-only — no pipeline-idle wait needed):

```python
    async def retrieve(
        self, project_id: str, question: str, *, k: int = 6
    ) -> list["RetrievedPassage"]:
        """Project-scoped retrieval. Returns passages whose provenance is inside
        this project; cross-project and uncited hits are dropped (no leakage)."""
        prefix = f"{project_id}::"
        try:
            async with self._client_factory() as client:
                resp = await client.post(
                    f"{self._base}/query",
                    params=self._params(),
                    json={
                        "query": question,
                        "mode": "mix",
                        "top_k": k,
                        "only_need_context": True,
                    },
                )
                resp.raise_for_status()
                chunks = (resp.json().get("data") or {}).get("chunks") or []
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"retrieve failed: {exc}") from exc

        passages: list[RetrievedPassage] = []
        for chunk in chunks:
            file_path = str(chunk.get("file_path", ""))
            if not file_path.startswith(prefix):
                continue
            citation = _parse_citation(file_path)
            if citation is None:
                continue
            passages.append(
                RetrievedPassage(
                    text=str(chunk.get("content", "")),
                    score=float(chunk.get("score", 0.0)),
                    citation=citation,
                )
            )
        return passages
```

- [ ] **Step 4: Run to verify pass**

```bash
cd backend && python -m pytest tests/test_rag_adapter.py -v
```
Expected: PASS (all, including the existing write-side tests).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/rag.py backend/tests/test_rag_adapter.py
rtk git commit -m "feat(rag): project-scoped retrieve() with citations (ScrumAgent-o39)"
```

### Task 2: `rag.clear_source()` — exact-source delete for Remember dedup (`o39`)

**Files:**
- Modify: `backend/app/rag.py`
- Test: `backend/tests/test_rag_adapter.py`

- [ ] **Step 1: Write the failing test** (uses the existing `_paginated_handler`)

```python
def test_clear_source_deletes_only_exact_file_source():
    docs = [
        {"id": "a", "file_path": "proj-1::note::msg-1", "status": "processed"},
        {"id": "b", "file_path": "proj-1::note::msg-2", "status": "processed"},   # other msg
        {"id": "c", "file_path": "proj-1::jira::msg-1", "status": "processed"},    # other kind
    ]
    deleted: list[str] = []
    count = asyncio.run(
        _client(_paginated_handler(docs, deleted=deleted)).clear_source("proj-1", "note", "msg-1")
    )
    assert count == 1
    assert deleted == ["a"]
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_rag_adapter.py::test_clear_source_deletes_only_exact_file_source -v
```
Expected: FAIL — `RagClient has no attribute 'clear_source'`.

- [ ] **Step 3: Implement** (reuses `_iter_project_docs`, `_delete_batch`, `_wait_for_idle`)

```python
    async def clear_source(
        self, project_id: str, source_kind: str, source_id: str
    ) -> int:
        target = f"{project_id}::{source_kind}::{source_id}"
        ids: list[str] = []
        try:
            async with self._client_factory() as client:
                async for doc in self._iter_project_docs(client, project_id):
                    if str(doc.get("file_path", "")) == target and doc.get("id"):
                        ids.append(doc["id"])
                for start in range(0, len(ids), _DELETE_BATCH):
                    await self._delete_batch(client, ids[start : start + _DELETE_BATCH])
                if ids:
                    await self._wait_for_idle(client)
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RagError(f"clear_source failed: {exc}") from exc
        return len(ids)
```

- [ ] **Step 4: Run to verify pass**

```bash
cd backend && python -m pytest tests/test_rag_adapter.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/app/rag.py backend/tests/test_rag_adapter.py
rtk git commit -m "feat(rag): clear_source() exact-file_source delete for dedup (ScrumAgent-o39)"
```

Then close the RAG read-side work: `bd close ScrumAgent-o39 --reason="retrieve + clear_source landed (read side)"` only after Task 17 confirms the live `/query` shape; otherwise leave open with a note.

### Task 3: LLM gateway `app/llm.py` (`wqj`)

**Files:**
- Create: `backend/app/llm.py`
- Modify: `backend/app/config.py` (add `openai_chat_model`)
- Modify: `backend/requirements.txt` (add `langchain-openai`)
- Test: `backend/tests/test_llm_gateway.py`

- [ ] **Step 1: Add the setting + dependency**

In `backend/app/config.py`, directly under `openai_model: str = "gpt-5.4-mini"`:

```python
    # Chat composition can run a cheaper model than the default; falls back to
    # openai_model when unset. Lets us drop to a cheaper tier without code.
    openai_chat_model: str | None = None
```

In `backend/requirements.txt`, under the web-framework block add:

```
# --- LLM (OpenAI only; gateway in app/llm.py) ---
langchain-openai>=0.2,<1.0
```

Install: `cd backend && pip install -r requirements.txt`.

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_llm_gateway.py`:

```python
from __future__ import annotations

import asyncio

from app.llm import LlmGateway


class _FakeChunk:
    def __init__(self, content: str, usage: dict | None = None):
        self.content = content
        self.usage_metadata = usage


class _FakeChatModel:
    """Stand-in for langchain_openai.ChatOpenAI."""
    def __init__(self, chunks):
        self._chunks = chunks
        self.seen_messages = None

    async def astream(self, messages, **kwargs):
        self.seen_messages = messages
        for c in self._chunks:
            yield c


def _gateway(model, recorded):
    return LlmGateway(model=model, usage_writer=lambda row: recorded.append(row))


def test_stream_chat_yields_token_deltas():
    model = _FakeChatModel([_FakeChunk("Half"), _FakeChunk(" the"), _FakeChunk(" team")])
    recorded = []
    gw = _gateway(model, recorded)

    async def run():
        return [d async for d in gw.stream_chat(
            [{"role": "user", "content": "hi"}], system="be grounded",
            run_id="r1", project_id="p1")]

    deltas = asyncio.run(run())
    assert deltas == ["Half", " the", " team"]
    # system prompt is prepended to the messages handed to the model
    assert model.seen_messages[0] == {"role": "system", "content": "be grounded"}


def test_stream_chat_writes_usage_row():
    model = _FakeChatModel([_FakeChunk("x", usage={"input_tokens": 1200, "output_tokens": 30})])
    recorded = []
    gw = _gateway(model, recorded)

    async def run():
        return [d async for d in gw.stream_chat(
            [{"role": "user", "content": "hi"}], run_id="r1", project_id="p1", context="chat")]

    asyncio.run(run())
    assert len(recorded) == 1
    row = recorded[0]
    assert row["project_id"] == "p1" and row["run_id"] == "r1"
    assert row["kind"] == "llm" and row["category"] == "chat"
    assert row["input_units"] == 1200 / 1_000_000 and row["output_units"] == 30 / 1_000_000
```

- [ ] **Step 3: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_llm_gateway.py -v
```
Expected: FAIL — `No module named 'app.llm'`.

- [ ] **Step 4: Implement `backend/app/llm.py`**

```python
"""Single chokepoint for OpenAI calls (decision: OpenAI only). Agents never
import OpenAI directly. Streaming wrapper over langchain_openai.ChatOpenAI that
writes one llm_usage row per call for the Billing tab (ScrumAgent-307)."""
from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Sequence

from app.config import Settings

# Usage units are millions of tokens (matches LlmUsage.input_units semantics).
_PER_MILLION = 1_000_000


class LlmGateway:
    def __init__(self, *, model, usage_writer: Callable[[dict], None] | None = None):
        self._model = model
        self._usage_writer = usage_writer

    @classmethod
    def from_settings(
        cls, settings: Settings, *, usage_writer: Callable[[dict], None] | None = None
    ) -> "LlmGateway":
        from langchain_openai import ChatOpenAI

        model = ChatOpenAI(
            model=settings.openai_chat_model or settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0.2,
            stream_usage=True,
        )
        return cls(model=model, usage_writer=usage_writer)

    async def stream_chat(
        self,
        messages: Sequence[dict],
        *,
        system: str | None = None,
        run_id: str | None = None,
        project_id: str,
        context: str = "chat",
    ) -> AsyncIterator[str]:
        payload = list(messages)
        if system:
            payload = [{"role": "system", "content": system}, *payload]

        usage: dict | None = None
        async for chunk in self._model.astream(payload):
            meta = getattr(chunk, "usage_metadata", None)
            if meta:
                usage = meta
            content = getattr(chunk, "content", "")
            if content:
                yield content

        if self._usage_writer is not None:
            in_tok = (usage or {}).get("input_tokens", 0)
            out_tok = (usage or {}).get("output_tokens", 0)
            self._usage_writer(
                {
                    "project_id": project_id,
                    "run_id": run_id,
                    "context": context,
                    "provider": "openai",
                    "model": getattr(self._model, "model_name", None)
                    or getattr(self._model, "model", "unknown"),
                    "kind": "llm",
                    "category": "chat",
                    "input_units": in_tok / _PER_MILLION,
                    "output_units": out_tok / _PER_MILLION,
                    "cost_usd": 0.0,
                }
            )
```

- [ ] **Step 5: Run to verify pass + commit**

```bash
cd backend && python -m pytest tests/test_llm_gateway.py -v
rtk git add backend/app/llm.py backend/app/config.py backend/requirements.txt backend/tests/test_llm_gateway.py
rtk git commit -m "feat(llm): streaming LlmGateway + usage logging (ScrumAgent-wqj)"
```

> Note: `cost_usd` stays 0.0 here; price-table mapping is out of scope for this slice (Billing aggregates units regardless). The `usage_writer` is wired to persist an `LlmUsage` row in Task 9.

### Task 4: Trace repository `repositories/trace.py` (`a27`)

**Files:**
- Create: `backend/app/repositories/trace.py`
- Test: `backend/tests/test_repositories_trace.py`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_repositories_trace.py`:

```python
from __future__ import annotations

from app.models.types import RunStatus, StepKind
from app.repositories import trace as trace_repo


def test_run_lifecycle_and_steps(db_session):
    run = trace_repo.start_run(db_session, entry_agent="user_chat")
    db_session.commit()
    assert run.status == RunStatus.running

    trace_repo.record_step(
        db_session, run_id=run.id, agent="user_chat", kind=StepKind.tool,
        input={"question": "q", "k": 6}, output={"n_passages": 3},
    )
    trace_repo.record_step(
        db_session, run_id=run.id, agent="user_chat", kind=StepKind.llm,
        input={"model": "m"}, output={"chars": 42},
    )
    trace_repo.finish_run(db_session, run_id=run.id, status=RunStatus.completed)
    db_session.commit()

    steps = trace_repo.list_steps(db_session, run.id)
    assert [s.kind for s in steps] == [StepKind.tool, StepKind.llm]
    assert trace_repo.get_run(db_session, run.id).status == RunStatus.completed
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_repositories_trace.py -v
```
Expected: FAIL — `cannot import name 'trace'`.

- [ ] **Step 3: Implement `backend/app/repositories/trace.py`**

```python
"""Trace store read/write helpers (ScrumAgent-a27). Models in app/models/trace.py."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.trace import TraceRun, TraceStep
from app.models.types import RunStatus, StepKind


def start_run(db: Session, *, entry_agent: str) -> TraceRun:
    run = TraceRun(entry_agent=entry_agent, status=RunStatus.running)
    db.add(run)
    db.flush()
    return run


def record_step(
    db: Session, *, run_id: str, agent: str, kind: StepKind,
    input: dict | None = None, output: dict | None = None,
) -> TraceStep:
    step = TraceStep(run_id=run_id, agent=agent, kind=kind, input=input, output=output)
    db.add(step)
    db.flush()
    return step


def finish_run(db: Session, *, run_id: str, status: RunStatus) -> None:
    from sqlalchemy import func
    run = db.get(TraceRun, run_id)
    if run is not None:
        run.status = status
        run.finished_at = func.now()
        db.flush()


def get_run(db: Session, run_id: str) -> TraceRun | None:
    return db.get(TraceRun, run_id)


def list_steps(db: Session, run_id: str) -> list[TraceStep]:
    stmt = select(TraceStep).where(TraceStep.run_id == run_id).order_by(TraceStep.ts)
    return list(db.scalars(stmt))
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && python -m pytest tests/test_repositories_trace.py -v
rtk git add backend/app/repositories/trace.py backend/tests/test_repositories_trace.py
rtk git commit -m "feat(trace): run/step repository (ScrumAgent-a27)"
```

---

## Phase 2 — Runtime orchestrator (`die`)

Claim: `bd update ScrumAgent-die --claim`.

### Task 5: `runtime/contracts.py`

**Files:**
- Create: `backend/app/runtime/__init__.py` (empty)
- Create: `backend/app/runtime/contracts.py`
- Test: `backend/tests/test_runtime_orchestrator.py` (shared with Task 6)

- [ ] **Step 1: Write the failing test**

`backend/tests/test_runtime_orchestrator.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_runtime_orchestrator.py -v
```
Expected: FAIL — `No module named 'app.runtime'`.

- [ ] **Step 3: Implement `backend/app/runtime/contracts.py`**

```python
"""App-owned orchestration contracts (ScrumAgent-die).

The runtime is DeepAgents-inspired but app-owned: capability boundaries and
handoffs are enforced here, not by an external agent library. See
docs/superpowers/specs/2026-06-18-user-chat-rag-streaming-design.md."""
from __future__ import annotations

import enum
from dataclasses import dataclass


class AgentName(str, enum.Enum):
    user_chat = "user_chat"
    meeting_participation = "meeting_participation"
    jira_notion = "jira_notion"


class RunMode(str, enum.Enum):
    chat = "chat"
    meeting = "meeting"


@dataclass
class RunContext:
    project_id: str
    user_id: int
    conversation_id: str | None
    run_id: str


@dataclass
class HandoffTarget:
    to: AgentName
    payload: dict


# Capability allow-list per agent. user_chat is read-only over RAG + LLM; it can
# never index, call MCP, or make external writes (enforced in orchestrator.py).
CAPABILITIES: dict[AgentName, set[str]] = {
    AgentName.user_chat: {"rag.retrieve", "llm"},
    AgentName.meeting_participation: {"rag.index", "llm", "calendar"},
    AgentName.jira_notion: {"mcp.jira", "mcp.notion", "llm"},
}
```

- [ ] **Step 4: Run (these two tests) to verify pass.** Don't commit yet — commit with Task 6.

### Task 6: `runtime/orchestrator.py` — allow-list, gated services, trace

**Files:**
- Create: `backend/app/runtime/orchestrator.py`
- Test: `backend/tests/test_runtime_orchestrator.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_runtime_orchestrator.py`:

```python
import asyncio

from app.models.types import RunStatus, StepKind
from app.repositories import trace as trace_repo
from app.runtime.contracts import AgentName, RunContext
from app.runtime.orchestrator import CapabilityError, Orchestrator


class _FakeRag:
    async def retrieve(self, *a, **k):
        return []
    async def index_documents(self, *a, **k):  # not allowed for user_chat
        return None


def _orch(db_session):
    return Orchestrator(
        llm=object(), rag=_FakeRag(),
        trace_factory=lambda: db_session,
    )


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
    # the write capability is NOT reachable through the gated bundle
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_runtime_orchestrator.py -v
```
Expected: FAIL — `cannot import name 'Orchestrator'`.

- [ ] **Step 3: Implement `backend/app/runtime/orchestrator.py`**

```python
"""Runtime orchestrator (ScrumAgent-die). Owns run lifecycle, the per-agent
capability allow-list, and trace recording. Agents receive only the services
their allow-list permits; anything else raises CapabilityError."""
from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.orm import Session

from app.models.types import RunStatus, StepKind
from app.repositories import trace as trace_repo
from app.runtime.contracts import CAPABILITIES, AgentName, RunContext


class CapabilityError(RuntimeError):
    """An agent reached for a capability outside its allow-list."""


class _GatedRag:
    """RAG handle that exposes only the methods the agent is allowed to use."""
    def __init__(self, rag, allowed: set[str]):
        self._rag = rag
        self._allowed = allowed

    async def retrieve(self, *args, **kwargs):
        if "rag.retrieve" not in self._allowed:
            raise CapabilityError("rag.retrieve not allowed")
        return await self._rag.retrieve(*args, **kwargs)

    def index_documents(self, *args, **kwargs):
        raise CapabilityError("rag.index not allowed for this agent")


class GatedServices:
    def __init__(self, *, rag, llm, allowed: set[str]):
        self.rag = _GatedRag(rag, allowed)
        self.llm = llm if "llm" in allowed else None
        self._allowed = allowed


class Orchestrator:
    def __init__(self, *, llm, rag, trace_factory: Callable[[], Session]):
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
        allowed = {
            (AgentName.user_chat, AgentName.jira_notion),
            (AgentName.meeting_participation, AgentName.jira_notion),
            (AgentName.jira_notion, AgentName.user_chat),
        }
        if (frm, to) not in allowed:
            raise CapabilityError(f"handoff {frm.value}->{to.value} not allowed")
        self.record(payload["run_id"], frm, StepKind.handoff, {"to": to.value}, None)
```

> The `trace_factory` returns the request-scoped `Session`; the router commits it. In tests it returns the `db_session` fixture directly.

- [ ] **Step 4: Run to verify pass + commit (Tasks 5+6)**

```bash
cd backend && python -m pytest tests/test_runtime_orchestrator.py -v
rtk git add backend/app/runtime/ backend/tests/test_runtime_orchestrator.py
rtk git commit -m "feat(runtime): app-owned orchestrator + capability allow-list + trace (ScrumAgent-die)"
```

`bd close ScrumAgent-die`.

---

## Phase 3 — Agent (`n6h`)

Claim: `bd update ScrumAgent-n6h --claim`.

### Task 7: `agents/user_chat.py` — deterministic retrieve→compose pipeline

**Files:**
- Create: `backend/app/agents/__init__.py` (empty)
- Create: `backend/app/agents/user_chat.py`
- Test: `backend/tests/test_agent_user_chat.py`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_agent_user_chat.py`:

```python
from __future__ import annotations

import asyncio

from app.agents.user_chat import CitationsEvent, TokenEvent, run
from app.rag import Citation, RetrievedPassage


class _Svc:
    def __init__(self, passages, deltas):
        self._passages = passages
        self._deltas = deltas
        self.llm_calls = 0
        self.seen_system = None

    class _Rag:
        pass

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
    from app.runtime.contracts import RunContext
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
    assert "only" in svc.seen_system.lower()  # grounded instruction present


def test_empty_context_yields_fixed_message_and_no_llm_call():
    svc = _Svc([], ["should not be used"])
    events = _drain(run(_ctx(), message="unknown", history=[], services=svc))
    tokens = "".join(e.delta for e in events if isinstance(e, TokenEvent))
    assert "knowledge base" in tokens.lower()
    assert svc.llm_calls == 0  # no hallucination, no spend
    cites = [e for e in events if isinstance(e, CitationsEvent)]
    assert cites[0].items == []
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_agent_user_chat.py -v
```
Expected: FAIL — `No module named 'app.agents'`.

- [ ] **Step 3: Implement `backend/app/agents/user_chat.py`**

```python
"""user_chat agent (ScrumAgent-n6h): deterministic RAG-grounded chat.

Pipeline is fixed (not a tool-loop): retrieve ALWAYS runs first, the answer is
composed only from retrieved context, and an empty context yields a fixed
"not in the knowledge base" reply with NO LLM call — anti-hallucination by
construction. Citations map answer markers [n] to passage provenance."""
from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.rag import RetrievedPassage
from app.runtime.contracts import RunContext

_MAX_HISTORY = 10
NO_CONTEXT_MESSAGE = (
    "I don't have anything about that in this project's knowledge base."
)
GROUNDED_SYSTEM = (
    "You answer questions about a software project using ONLY the numbered "
    "context passages provided. If the answer is not in the context, say you "
    "don't have it in the project knowledge base. Never invent facts. Cite the "
    "passages you use inline with their bracketed number, e.g. [1], [2]."
)


@dataclass
class TokenEvent:
    delta: str


@dataclass
class CitationsEvent:
    items: list[dict]


def _citations(passages: list[RetrievedPassage]) -> list[dict]:
    out = []
    for i, p in enumerate(passages, start=1):
        c = p.citation
        out.append({
            "n": i, "source_kind": c.source_kind, "source_id": c.source_id,
            "title": c.title, "source_uri": c.source_uri, "score": p.score,
        })
    return out


def _context_block(passages: list[RetrievedPassage]) -> str:
    lines = []
    for i, p in enumerate(passages, start=1):
        c = p.citation
        label = c.title or f"{c.source_kind}:{c.source_id}"
        lines.append(f"[{i}] ({label}) {p.text}")
    return "\n\n".join(lines)


async def run(
    ctx: RunContext, *, message: str, history: list[dict], services
) -> AsyncIterator[object]:
    passages = await services.rag.retrieve(ctx.project_id, message, k=6)
    if not passages:
        yield TokenEvent(NO_CONTEXT_MESSAGE)
        yield CitationsEvent([])
        return

    prompt_messages = [
        *history[-_MAX_HISTORY:],
        {
            "role": "user",
            "content": f"Context:\n{_context_block(passages)}\n\nQuestion: {message}",
        },
    ]
    async for delta in services.llm.stream_chat(
        prompt_messages, system=GROUNDED_SYSTEM,
        run_id=ctx.run_id, project_id=ctx.project_id,
    ):
        yield TokenEvent(delta)
    yield CitationsEvent(_citations(passages))
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && python -m pytest tests/test_agent_user_chat.py -v
rtk git add backend/app/agents/ backend/tests/test_agent_user_chat.py
rtk git commit -m "feat(agent): deterministic user_chat retrieve->compose pipeline (ScrumAgent-n6h)"
```

`bd close ScrumAgent-n6h`.

---

## Phase 4 — Data model + API (`2jb` chat slice, `n15`)

Claim: `bd update ScrumAgent-2jb --claim`.

### Task 8: `Conversation.project_id` + repo

**Files:**
- Modify: `backend/app/models/chat.py`
- Modify: `backend/app/repositories/chat.py`
- Test: `backend/tests/test_models_chat.py`, `backend/tests/test_repositories_chat.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_repositories_chat.py`:

```python
def test_create_conversation_binds_project_and_lists_by_owner(db_session):
    from app.repositories import chat as chat_repo
    from app.models.types import MessageRole

    c1 = chat_repo.create_conversation(db_session, user_id=1, project_id="p1",
                                       agent="user_chat", title="first")
    chat_repo.create_conversation(db_session, user_id=1, project_id="p2",
                                  agent="user_chat", title="other project")
    chat_repo.create_conversation(db_session, user_id=2, project_id="p1",
                                  agent="user_chat", title="other user")
    db_session.commit()
    assert c1.project_id == "p1"

    mine = chat_repo.list_conversations(db_session, user_id=1, project_id="p1")
    assert [c.title for c in mine] == ["first"]
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_repositories_chat.py::test_create_conversation_binds_project_and_lists_by_owner -v
```
Expected: FAIL — `create_conversation() got an unexpected keyword argument 'project_id'`.

- [ ] **Step 3: Implement**

In `backend/app/models/chat.py`, add to `Conversation` (after `user_id`):

```python
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )
```

In `backend/app/repositories/chat.py`, update `create_conversation` and add `list_conversations`:

```python
def create_conversation(
    db: Session, *, user_id: int, project_id: str, agent: str, title: str | None = None
) -> Conversation:
    convo = Conversation(user_id=user_id, project_id=project_id, agent=agent, title=title)
    db.add(convo)
    db.flush()
    return convo


def list_conversations(db: Session, *, user_id: int, project_id: str) -> list[Conversation]:
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user_id, Conversation.project_id == project_id)
        .order_by(Conversation.updated_at.desc())
    )
    return list(db.scalars(stmt))
```

- [ ] **Step 4: Run (both chat test files) + commit**

```bash
cd backend && python -m pytest tests/test_repositories_chat.py tests/test_models_chat.py -v
rtk git add backend/app/models/chat.py backend/app/repositories/chat.py backend/tests/test_repositories_chat.py
rtk git commit -m "feat(chat): bind Conversation to project; list_conversations by owner (ScrumAgent-2jb)"
```

### Task 9: DI wiring — `get_rag_client`, `get_llm_gateway`, `get_orchestrator`

**Files:**
- Modify: `backend/app/deps.py`
- Test: `backend/tests/test_deps.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_deps.py`:

```python
def test_get_rag_client_builds():
    from app.config import Settings
    from app import deps
    from app.rag import RagClient

    s = Settings(_env_file=None, secret_key="x", openai_api_key="k",
                 google_client_id="c", google_client_secret="s")
    assert isinstance(deps.get_rag_client(s), RagClient)
```

> `get_llm_gateway`/`get_orchestrator` carry `Depends(...)` defaults that only resolve under FastAPI, so they are exercised through the chat endpoint test (Task 10) rather than called directly here.

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_deps.py::test_get_rag_client_builds -v
```
Expected: FAIL — `module 'app.deps' has no attribute 'get_rag_client'`.

- [ ] **Step 3: Implement — add to `backend/app/deps.py`**

```python
def get_rag_client(settings: Settings = Depends(get_settings)) -> "RagClient":
    from app.rag import RagClient
    return RagClient.from_settings(settings)


def get_llm_gateway(settings: Settings = Depends(get_settings)) -> "LlmGateway":
    from app.llm import LlmGateway
    return LlmGateway.from_settings(settings)


def get_orchestrator(
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> "Orchestrator":
    """Orchestrator wired to RAG + LLM, sharing the request DB session so trace
    runs/steps commit in the same transaction as the chat messages."""
    from app.llm import LlmGateway
    from app.rag import RagClient
    from app.runtime.orchestrator import Orchestrator

    return Orchestrator(
        llm=LlmGateway.from_settings(settings),
        rag=RagClient.from_settings(settings),
        trace_factory=lambda: db,
    )
```

> `get_orchestrator` depends on `get_db`, so the orchestrator's `trace_factory` returns the same request-scoped `Session` the chat router persists messages with — trace runs/steps and chat messages commit atomically on the single `db.commit()`.

- [ ] **Step 4: Run + commit**

```bash
cd backend && python -m pytest tests/test_deps.py -v
rtk git add backend/app/deps.py backend/tests/test_deps.py
rtk git commit -m "feat(deps): rag/llm/orchestrator providers (ScrumAgent-2jb)"
```

### Task 10: Chat router — `POST /projects/{id}/chat` (SSE) + persistence + trace

**Files:**
- Create: `backend/app/routers/chat.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/test_chat_api.py`

This task wires retrieve→compose→stream end-to-end with persistence and trace. Use a fake orchestrator in tests so no OpenAI/LightRAG is touched.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_chat_api.py`:

```python
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.main import app
from app.models import Project, ProjectCredential, ProjectMember, User
from app.models.types import ProjectRole
from app.security import create_access_token

SECRET = "router-test-secret"


def _settings() -> Settings:
    return Settings(_env_file=None, secret_key=SECRET, openai_api_key="k",
                    google_client_id="c", google_client_secret="s",
                    backend_base_url="http://testserver", allowed_domain="municorn.com")


def _auth(uid: int) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(uid), SECRET, extra={'env': 'production'})}"}


def _user(db, email="alice@municorn.com", sub="sub-alice") -> User:
    u = User(google_sub=sub, email=email, name="Alice")
    db.add(u); db.commit(); db.refresh(u)
    return u


def _project(db, owner) -> Project:
    p = Project(owner_id=owner.id, name="P", agent_email="a@municorn.com", google_connected=True)
    p.credential = ProjectCredential(google_refresh_token="rt")
    p.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.member))
    db.add(p); db.commit(); db.refresh(p)
    return p


class _FakeOrch:
    """Streams two tokens + citations; records nothing real."""
    def __init__(self, db):
        self._db = db
    async def start_run(self, agent, ctx):
        from app.repositories import trace as t
        run = t.start_run(self._db, entry_agent=agent.value); self._db.flush()
        ctx.run_id = run.id; return run.id
    def services_for(self, agent, ctx):
        return None
    def record(self, *a, **k): ...
    def finish(self, *a, **k):
        from app.models.types import RunStatus
        from app.repositories import trace as t
        t.finish_run(self._db, run_id=a[0], status=RunStatus.completed)


async def _fake_agent_run(ctx, *, message, history, services):
    from app.agents.user_chat import TokenEvent, CitationsEvent
    yield TokenEvent("Half ")
    yield TokenEvent("the team")
    yield CitationsEvent([{"n": 1, "source_kind": "jira", "source_id": "PLAT-12",
                           "title": "Login", "source_uri": "http://j/PLAT-12", "score": 0.9}])


@pytest.fixture
def client(db_session, monkeypatch):
    def _ov_db():
        yield db_session
    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_orchestrator] = lambda: _FakeOrch(db_session)
    # swap the agent pipeline for a deterministic fake
    monkeypatch.setattr("app.routers.chat.agent_run", _fake_agent_run)
    yield TestClient(app)
    app.dependency_overrides.clear()


def _sse_events(resp) -> list[dict]:
    events = []
    for line in resp.text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
    return events


def test_chat_streams_tokens_citations_done_and_persists(client, db_session):
    user = _user(db_session); project = _project(db_session, user)
    resp = client.post(f"/projects/{project.id}/chat",
                       headers=_auth(user.id), json={"message": "why?"})
    assert resp.status_code == 200
    events = _sse_events(resp)
    types = [e["type"] for e in events]
    assert types[0] == "meta"
    assert "token" in types and "citations" in types and types[-1] == "done"
    assert "".join(e["delta"] for e in events if e["type"] == "token") == "Half the team"

    # user + assistant messages persisted; assistant carries citations + run id
    from app.models.chat import Message, Conversation
    convo = db_session.query(Conversation).filter_by(user_id=user.id).one()
    assert convo.project_id == project.id
    msgs = db_session.query(Message).order_by(Message.id).all()
    assert [m.role.value for m in msgs] == ["user", "assistant"]
    assert msgs[1].meta["citations"][0]["source_id"] == "PLAT-12"
    assert msgs[1].trace_run_id is not None


def test_chat_requires_auth(client, db_session):
    user = _user(db_session); project = _project(db_session, user)
    resp = client.post(f"/projects/{project.id}/chat", json={"message": "x"})
    assert resp.status_code == 401


def test_chat_continues_existing_conversation(client, db_session):
    user = _user(db_session); project = _project(db_session, user)
    r1 = client.post(f"/projects/{project.id}/chat", headers=_auth(user.id), json={"message": "one"})
    cid = next(e for e in _sse_events(r1) if e["type"] == "meta")["conversation_id"]
    client.post(f"/projects/{project.id}/chat", headers=_auth(user.id),
                json={"message": "two", "conversation_id": cid})
    from app.models.chat import Conversation, Message
    assert db_session.query(Conversation).filter_by(user_id=user.id).count() == 1
    assert db_session.query(Message).count() == 4


def test_chat_rejects_other_users_conversation(client, db_session):
    owner = _user(db_session); project = _project(db_session, owner)
    r1 = client.post(f"/projects/{project.id}/chat", headers=_auth(owner.id), json={"message": "hi"})
    cid = next(e for e in _sse_events(r1) if e["type"] == "meta")["conversation_id"]
    intruder = _user(db_session, email="eve@municorn.com", sub="sub-eve")
    project.members.append(ProjectMember(user_id=intruder.id, role=ProjectRole.member))
    db_session.commit()
    resp = client.post(f"/projects/{project.id}/chat", headers=_auth(intruder.id),
                       json={"message": "steal", "conversation_id": cid})
    assert resp.status_code in (403, 404)
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && python -m pytest tests/test_chat_api.py -v
```
Expected: FAIL — `app.routers.chat` does not exist.

- [ ] **Step 3: Implement `backend/app/routers/chat.py`**

Mirror the membership guard used by knowledge-base routes (look at how `backend/app/routers/projects.py` resolves a project + checks `ProjectMember` for the current user; reuse that helper — e.g. `app/membership.py`). Pseudocode below uses `require_member(db, project_id, user)` for that check; wire it to the existing helper.

```python
"""Chat router (ScrumAgent-2jb chat slice): SSE chat + conversation history +
remember. JWT + project membership required; conversation endpoints additionally
require the conversation to belong to the current user."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.user_chat import CitationsEvent, TokenEvent
from app.agents.user_chat import run as agent_run
from app.deps import get_current_user, get_db, get_orchestrator
from app.models import Project, User
from app.models.chat import Conversation, Message
from app.models.types import MessageRole, RunStatus, StepKind
from app.routers.projects import require_project_access
from app.repositories import chat as chat_repo
from app.runtime.contracts import AgentName, RunContext
from app.models.usage import LlmUsage

router = APIRouter(prefix="/projects/{project_id}", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


def _owned_conversation(db, *, conversation_id, user, project_id) -> Conversation:
    convo = db.get(Conversation, conversation_id)
    if convo is None or convo.user_id != user.id or convo.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return convo


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/chat")
async def chat(
    project_id: str,
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project: Project = Depends(require_project_access),  # 404 if not a member
    orchestrator=Depends(get_orchestrator),
) -> StreamingResponse:
    if body.conversation_id:
        convo = _owned_conversation(db, conversation_id=body.conversation_id,
                                    user=user, project_id=project_id)
    else:
        convo = chat_repo.create_conversation(
            db, user_id=user.id, project_id=project_id, agent="user_chat",
            title=body.message[:80])
    chat_repo.append_message(db, conversation_id=convo.id, role=MessageRole.user,
                             content=body.message)
    history = [
        {"role": m.role.value, "content": m.content}
        for m in chat_repo.get_history(db, convo.id)
        if m.role in (MessageRole.user, MessageRole.assistant)
    ][:-1]  # exclude the just-added user message; agent appends it with context
    db.commit()

    async def stream() -> AsyncIterator[str]:
        ctx = RunContext(project_id=project_id, user_id=user.id,
                         conversation_id=convo.id, run_id="")
        run_id = await orchestrator.start_run(AgentName.user_chat, ctx)
        yield _sse({"type": "meta", "conversation_id": convo.id, "run_id": run_id})
        # usage rows from the gateway are buffered and persisted with the turn
        usage_rows: list[dict] = []
        services = orchestrator.services_for(AgentName.user_chat, ctx)
        if services is not None and getattr(services, "llm", None) is not None:
            services.llm._usage_writer = usage_rows.append  # capture for this run
        text_parts: list[str] = []
        citations: list[dict] = []
        try:
            async for event in agent_run(ctx, message=body.message,
                                         history=history, services=services):
                if isinstance(event, TokenEvent):
                    text_parts.append(event.delta)
                    yield _sse({"type": "token", "delta": event.delta})
                elif isinstance(event, CitationsEvent):
                    citations = event.items
                    yield _sse({"type": "citations", "items": event.items})
            msg = chat_repo.append_message(
                db, conversation_id=convo.id, role=MessageRole.assistant,
                content="".join(text_parts), meta={"citations": citations},
                trace_run_id=run_id)
            for row in usage_rows:
                db.add(LlmUsage(**row))
            orchestrator.record(run_id, AgentName.user_chat, StepKind.tool,
                                {"question": body.message, "k": 6},
                                {"n_passages": len(citations)})
            orchestrator.record(run_id, AgentName.user_chat, StepKind.llm,
                                {"history_len": len(history)},
                                {"chars": len("".join(text_parts))})
            orchestrator.finish(run_id, RunStatus.completed)
            db.commit()
            yield _sse({"type": "done", "message_id": msg.id})
        except Exception as exc:  # noqa: BLE001 - surface as a stream error
            orchestrator.finish(run_id, RunStatus.failed)
            db.commit()
            yield _sse({"type": "error", "detail": str(exc)})

    return StreamingResponse(stream(), media_type="text/event-stream")
```

In `backend/app/main.py`, add `chat` to the routers import and `app.include_router(chat.router)`.

> `require_project_access` (in `routers/projects.py`) is the existing dependency: it resolves the `{project_id}` path param to a `Project` and raises 404 if the caller is not a member (existence is not leaked). Conversation ownership is the separate `_owned_conversation` check. The `_FakeOrch` test double therefore needs a no-op `record(self, *a, **k)` (already present) and `services_for` returning `None`.

- [ ] **Step 4: Run + commit**

```bash
cd backend && python -m pytest tests/test_chat_api.py -v
rtk git add backend/app/routers/chat.py backend/app/main.py backend/tests/test_chat_api.py
rtk git commit -m "feat(chat): SSE chat endpoint with persistence + trace (ScrumAgent-2jb)"
```

### Task 11: Conversation history endpoints (owner-scoped)

**Files:**
- Modify: `backend/app/routers/chat.py`
- Test: `backend/tests/test_chat_api.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_list_conversations_only_mine(client, db_session):
    user = _user(db_session); project = _project(db_session, user)
    client.post(f"/projects/{project.id}/chat", headers=_auth(user.id), json={"message": "mine"})
    resp = client.get(f"/projects/{project.id}/conversations", headers=_auth(user.id))
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1 and rows[0]["title"] == "mine"


def test_get_messages_owner_scoped(client, db_session):
    user = _user(db_session); project = _project(db_session, user)
    r = client.post(f"/projects/{project.id}/chat", headers=_auth(user.id), json={"message": "q"})
    cid = next(e for e in _sse_events(r) if e["type"] == "meta")["conversation_id"]
    resp = client.get(f"/projects/{project.id}/conversations/{cid}/messages", headers=_auth(user.id))
    assert resp.status_code == 200
    roles = [m["role"] for m in resp.json()]
    assert roles == ["user", "assistant"]
    assert resp.json()[1]["meta"]["citations"][0]["source_id"] == "PLAT-12"
```

- [ ] **Step 2: Run to verify failure** (404 — endpoints absent).

- [ ] **Step 3: Implement — add to `backend/app/routers/chat.py`**

```python
class ConversationOut(BaseModel):
    id: str
    title: str | None
    updated_at: str


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    meta: dict | None
    created_at: str


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(project_id: str, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db),
                       project: Project = Depends(require_project_access)):
    rows = chat_repo.list_conversations(db, user_id=user.id, project_id=project_id)
    return [ConversationOut(id=c.id, title=c.title, updated_at=c.updated_at.isoformat())
            for c in rows]


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(project_id: str, conversation_id: str, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db),
                 project: Project = Depends(require_project_access)):
    convo = _owned_conversation(db, conversation_id=conversation_id, user=user,
                                project_id=project_id)
    return [
        MessageOut(id=m.id, role=m.role.value, content=m.content, meta=m.meta,
                   created_at=m.created_at.isoformat())
        for m in chat_repo.get_history(db, convo.id)
    ]
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && python -m pytest tests/test_chat_api.py -v
rtk git add backend/app/routers/chat.py backend/tests/test_chat_api.py
rtk git commit -m "feat(chat): owner-scoped conversation list + messages (ScrumAgent-2jb)"
```

`bd close ScrumAgent-2jb` after the frontend chat slice (it is the router half).

### Task 12: Remember endpoint — dedup write-back (`n15`)

**Files:**
- Modify: `backend/app/routers/chat.py`
- Test: `backend/tests/test_chat_api.py`

Uses a fake RAG client injected via a new dep so tests assert dedup ordering.

- [ ] **Step 1: Write the failing test**

```python
def test_remember_dedups_then_indexes_qa(client, db_session, monkeypatch):
    user = _user(db_session); project = _project(db_session, user)
    r = client.post(f"/projects/{project.id}/chat", headers=_auth(user.id), json={"message": "why login?"})
    mid = next(e for e in _sse_events(r) if e["type"] == "done")["message_id"]

    calls = []
    class _Rag:
        async def clear_source(self, pid, kind, sid):
            calls.append(("clear", pid, kind, sid)); return 0
        async def index_documents(self, pid, docs):
            calls.append(("index", pid, docs[0].source_kind, docs[0].source_id, docs[0].text))
            from app.rag import IndexResult
            return IndexResult(submitted=1, track_id="trk-9")
    from app import deps
    app.dependency_overrides[deps.get_rag_client] = lambda: _Rag()

    resp = client.post(f"/projects/{project.id}/chat/messages/{mid}/remember", headers=_auth(user.id))
    assert resp.status_code == 200 and resp.json()["track_id"] == "trk-9"
    # dedup (clear) happens BEFORE index, keyed by message id, kind "note"
    assert calls[0] == ("clear", project.id, "note", str(mid))
    assert calls[1][0] == "index" and calls[1][2] == "note" and calls[1][3] == str(mid)
    # Q+A composed: question then answer
    assert calls[1][4].startswith("why login?")
    app.dependency_overrides.pop(deps.get_rag_client, None)


def test_remember_rejects_other_users_message(client, db_session):
    owner = _user(db_session); project = _project(db_session, owner)
    r = client.post(f"/projects/{project.id}/chat", headers=_auth(owner.id), json={"message": "q"})
    mid = next(e for e in _sse_events(r) if e["type"] == "done")["message_id"]
    intruder = _user(db_session, email="eve@municorn.com", sub="sub-eve")
    project.members.append(ProjectMember(user_id=intruder.id, role=ProjectRole.member)); db_session.commit()
    resp = client.post(f"/projects/{project.id}/chat/messages/{mid}/remember", headers=_auth(intruder.id))
    assert resp.status_code in (403, 404)
```

- [ ] **Step 2: Run to verify failure** (404 — endpoint absent).

- [ ] **Step 3: Implement — add to `backend/app/routers/chat.py`**

```python
from app.deps import get_rag_client
from app.rag import RagDocument


@router.post("/chat/messages/{message_id}/remember")
async def remember(project_id: str, message_id: int, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db), rag=Depends(get_rag_client),
                   project: Project = Depends(require_project_access)):
    msg = db.get(Message, message_id)
    if msg is None or msg.role != MessageRole.assistant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Answer not found")
    convo = _owned_conversation(db, conversation_id=msg.conversation_id, user=user,
                                project_id=project_id)
    # nearest preceding user message = the question
    question = next(
        (m.content for m in reversed(chat_repo.get_history(db, convo.id))
         if m.id < msg.id and m.role == MessageRole.user), "")
    doc = RagDocument(text=f"{question}\n\n{msg.content}", source_kind="note",
                      source_id=str(message_id), title=question[:120], source_uri="")
    await rag.clear_source(project_id, "note", str(message_id))   # dedup, no flag
    result = await rag.index_documents(project_id, [doc])
    return {"track_id": result.track_id, "status": "ok"}
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && python -m pytest tests/test_chat_api.py -v
rtk git add backend/app/routers/chat.py backend/tests/test_chat_api.py
rtk git commit -m "feat(chat): Remember endpoint — dedup Q+A write-back to RAG (ScrumAgent-n15)"
```

---

## Phase 5 — Frontend (`r0k` chat slice)

Claim: `bd update ScrumAgent-r0k --claim`. Verify with the preview tools (start dev server, drive the chat, screenshot) — not manual asks.

### Task 13: API client + SSE reader

**Files:**
- Modify: `apps/web/lib/api.ts`
- Create: `apps/web/lib/chat-stream.ts`

- [ ] **Step 1: Add chat types + methods to `apps/web/lib/api.ts`**

```typescript
export interface ChatCitation {
  n: number; source_kind: string; source_id: string;
  title: string | null; source_uri: string | null; score: number;
}
export interface ConversationRow { id: string; title: string | null; updated_at: string; }
export interface ChatMessageRow {
  id: number; role: "user" | "assistant" | "system" | "tool";
  content: string; meta: { citations?: ChatCitation[] } | null; created_at: string;
}

// add to the `api` object:
//   listConversations: (projectId) => apiFetch<ConversationRow[]>(`/projects/${projectId}/conversations`)
//   getMessages: (projectId, cid) => apiFetch<ChatMessageRow[]>(`/projects/${projectId}/conversations/${cid}/messages`)
//   remember: (projectId, messageId) => apiFetch(`/projects/${projectId}/chat/messages/${messageId}/remember`, { method: "POST" })
```

- [ ] **Step 2: Create `apps/web/lib/chat-stream.ts`** (EventSource can't send the bearer header; use `fetch` + reader)

```typescript
import { API_BASE, getToken } from "./auth";
import type { ChatCitation } from "./api";

export type ChatEvent =
  | { type: "meta"; conversation_id: string; run_id: string }
  | { type: "token"; delta: string }
  | { type: "citations"; items: ChatCitation[] }
  | { type: "done"; message_id: number }
  | { type: "error"; detail: string };

export async function streamChat(
  projectId: string,
  body: { message: string; conversation_id?: string },
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/projects/${projectId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) throw new Error(`chat failed (${resp.status})`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as ChatEvent);
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/lib/api.ts apps/web/lib/chat-stream.ts
rtk git commit -m "feat(web): chat API client + fetch-based SSE reader (ScrumAgent-r0k)"
```

### Task 14: Real streaming in `ChatScreen` (project_id + citations)

**Files:**
- Modify: `apps/web/components/screens/chat/ChatScreen.tsx`
- Modify: `apps/web/components/screens/chat/mock-responses.ts` (extend `Message` type with citations + db id) or move the type into the screen.

- [ ] **Step 1: Replace the `setTimeout` `send()` with a real stream.** Keep the timer-cancel/generation pattern for cancel-on-new-send. Wire `project_id` from `useActiveProject()`; guard the `__no-project__` state. Map events:

```typescript
import { useActiveProject } from "@/components/shell/ActiveProjectProvider";
import { streamChat } from "@/lib/chat-stream";

// inside ChatScreen:
const { activeProject } = useActiveProject();
const conversationIdRef = useRef<string | null>(null);

const send = useCallback((text: string) => {
  const trimmed = text.trim();
  if (!trimmed || activeProject.id === "__no-project__") return;
  cancelStreaming();
  const gen = generationRef.current;
  setInput(""); setStreaming(true);
  setMessages((m) => [
    ...m,
    { role: "user", text: trimmed, ts: nowHHMM(), final: true },
    { role: "agent", text: "", ts: nowHHMM(), final: false, sources: [], dbId: null },
  ]);

  const appendAgent = (patch: Partial<Message>) =>
    setMessages((m) => {
      const next = [...m];
      const last = next[next.length - 1];
      if (!last || last.role !== "agent") return m;
      next[next.length - 1] = { ...last, ...patch };
      return next;
    });

  streamChat(activeProject.id, { message: trimmed, conversation_id: conversationIdRef.current ?? undefined }, (e) => {
    if (gen !== generationRef.current) return; // a newer send superseded this one
    if (e.type === "meta") conversationIdRef.current = e.conversation_id;
    else if (e.type === "token") setMessages((m) => {
      const next = [...m]; const last = next[next.length - 1];
      if (last?.role === "agent") next[next.length - 1] = { ...last, text: (last.text ?? "") + e.delta };
      return next;
    });
    else if (e.type === "citations") appendAgent({ sources: e.items.map((c) => ({ label: c.title ?? `${c.source_kind}:${c.source_id}`, href: c.source_uri ?? undefined })) });
    else if (e.type === "done") { appendAgent({ final: true, dbId: e.message_id }); setStreaming(false); }
    else if (e.type === "error") { appendAgent({ final: true, text: `⚠️ ${e.detail}` }); setStreaming(false); }
  }).catch((err) => { appendAgent({ final: true, text: `⚠️ ${String(err)}` }); setStreaming(false); });
}, [activeProject.id, cancelStreaming]);
```

Extend the `Message` type with `dbId: number | null` and ensure `sources` matches `ChatMessage`'s rendering shape (label + optional href). Update the hardcoded subtitle to `project: {activeProject.name}`.

- [ ] **Step 2: Verify with preview tools.** `preview_start`; navigate to `/chat`; ensure a project is active; send a message; `preview_console_logs` (no errors), `preview_snapshot` (streaming text appears), `preview_network` (the `/chat` request streams). `preview_screenshot` for proof.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/components/screens/chat/ChatScreen.tsx apps/web/components/screens/chat/mock-responses.ts
rtk git commit -m "feat(web): real SSE chat streaming + citations + active project (ScrumAgent-r0k)"
```

### Task 15: Remember button on each answer

**Files:**
- Modify: `apps/web/components/screens/chat/ChatMessage.tsx`

- [ ] **Step 1:** On a final agent message with a `dbId`, render a "Remember" button calling `api.remember(activeProject.id, dbId)`. Local state per message: `idle → saving → saved` (transient "Saved to knowledge base ✓"); always re-enabled afterward (dedup makes re-click safe). Pass `projectId` + a `onRemember` handler down from `ChatScreen`, or read `useActiveProject()` directly in `ChatMessage`.

```tsx
const [remembered, setRemembered] = useState(false);
const [saving, setSaving] = useState(false);
// ...
{message.final && message.dbId != null && (
  <button className="btn btn-ghost btn-sm" disabled={saving} onClick={async () => {
    setSaving(true);
    try { await api.remember(activeProject.id, message.dbId!); setRemembered(true); }
    finally { setSaving(false); }
  }}>
    <Icon name="bookmark" size={12} /> {remembered ? "Saved to knowledge base ✓" : "Remember"}
  </button>
)}
```

- [ ] **Step 2: Verify with preview.** Click Remember; `preview_network` shows `POST …/remember` → 200 with `track_id`; button shows saved state.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/components/screens/chat/ChatMessage.tsx
rtk git commit -m "feat(web): Remember button writes answer back to knowledge base (ScrumAgent-n15)"
```

### Task 16: Resumable history pane

**Files:**
- Modify: `apps/web/components/screens/chat/ChatScreen.tsx`, `ChatHistoryPane.tsx`

- [ ] **Step 1:** Replace mock `SESSIONS` with `api.listConversations(activeProject.id)` (load on mount + after each `done`). `onOpenSession(id)` → `api.getMessages(...)`, map rows into `Message[]` (assistant rows hydrate `sources` from `meta.citations`), set `conversationIdRef.current = id`. "New session" clears messages + sets `conversationIdRef.current = null`. Re-fetch the list when `activeProject.id` changes.

- [ ] **Step 2: Verify with preview.** Send in one session; start a new one; reopen the first from the pane → prior messages + citations rehydrate; continue it (the follow-up lands in the same conversation — confirm via `preview_network` that the second `/chat` posts the same `conversation_id`).

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/components/screens/chat/ChatScreen.tsx apps/web/components/screens/chat/ChatHistoryPane.tsx
rtk git commit -m "feat(web): resumable per-project chat history (ScrumAgent-r0k)"
```

`bd close ScrumAgent-r0k` (chat slice) and `ScrumAgent-2jb`, `ScrumAgent-n15`.

---

## Phase 6 — End-to-end smoke

### Task 17: Live e2e against LightRAG + OpenAI

- [ ] **Step 1:** `docker compose up` (backend + LightRAG + Postgres + web). Ensure a project with indexed backlog exists (run a sync if needed; Settings → Knowledge base shows counts > 0).
- [ ] **Step 2:** Confirm the Task 1 Step 0 spike: a real `/query` context-only call returns chunks with `file_path`. If the shape differed from the assumed `{"data":{"chunks":[…]}}`, fix `rag.retrieve`'s parser now and re-run `tests/test_rag_adapter.py`.
- [ ] **Step 3:** In the browser `/chat`: ask a question answerable from the backlog → streamed answer with citation chips that link to the source. Ask something absent → the fixed "not in the knowledge base" reply (verify in `preview_network` that no long LLM stream occurred).
- [ ] **Step 4:** Click Remember on a good answer; re-run the same question → the remembered note now appears among sources (validates write-back + dedup: click Remember twice, confirm only one `note` doc via Settings → Knowledge base count or a `status()` check).
- [ ] **Step 5:** Reload; reopen the conversation from history → messages + citations rehydrate. Log in as a second user → the first user's conversations are not listed.
- [ ] **Step 6:** Run the whole backend suite: `cd backend && python -m pytest -q`. Then the session-close protocol: `git pull --rebase` → `bd dolt push` → `git push` → `git status` shows up to date.

---

## Self-Review

**Spec coverage:** retrieve+project filter (T1) · clear_source/dedup (T2, T12) · LLM gateway streaming+usage (T3) · trace repo (T4) · orchestrator allow-list/trace/handoff mechanism (T5–6) · deterministic user_chat + anti-hallucination empty path (T7) · Conversation.project_id + privacy (T8, T10–12) · SSE contract meta/token/citations/done/error (T10) · resumable owner-scoped history (T11, T16) · Remember Q+A dedup (T12, T15) · frontend streaming+citations+project (T13–14) · model via settings/OPENAI_CHAT_MODEL (T3) · deps langchain-openai only (T3) · trace+usage persisted (T10) · live `/query` shape risk (T1 Step 0, T17). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the one external unknown (LightRAG `/query` shape) is an explicit spike with a concrete fallback, not a placeholder.

**Type consistency:** `RetrievedPassage`/`Citation` (T1) consumed by `user_chat` (T7) and `retrieve` mock (T10/T12). `TokenEvent`/`CitationsEvent` defined in T7, imported by router (T10) and tests. `agent_run` alias (router import of `user_chat.run`) is what T10 monkeypatches. `RunContext`/`AgentName`/`CAPABILITIES` (T5) used by orchestrator (T6), agent (T7), router (T10). `create_conversation(project_id=…)`/`list_conversations` (T8) used by router (T10–11). `_usage_writer` attribute (T3) reassigned per-run by the router (T10). `clear_source(project_id, "note", str(message_id))` identical in T2/T12. SSE `data:` JSON shape identical in T10 emit and T13 reader.
