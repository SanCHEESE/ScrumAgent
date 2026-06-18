# user_chat — RAG-grounded streaming chat (with citations + Remember)

Date: 2026-06-18
Status: design — awaiting review

## Context

RAG today is write-only: backlog (Jira/Notion) is indexed into LightRAG and surfaced
only as counts/health in Settings → Knowledge base. Nothing reads the knowledge back
into a user-facing surface. This slice builds the **read path end-to-end**: a
project-scoped chat that answers **only** from RAG, streams its answer with inline
citations, persists conversations per user, and lets the user push good answers back
into the knowledge base via a **Remember** button.

This is a full vertical slice spanning several planned issues:
`o39` (RAG retrieve), `wqj` (LLM gateway), `a27` (trace store repo), `die`
(orchestrator), `n6h` (user_chat agent), `2jb` (chat router slice), `r0k`
(frontend chat slice), plus a new issue for Remember.

### Decisions locked during brainstorming

- **Scope:** full vertical slice — backend + working browser chat.
- **Orchestrator flavor (B2):** build the *documented app-owned* runtime contract
  (`runtime/contracts.py` + `orchestrator.py`: capability allow-list, trace, handoff
  mechanism) **without** pulling the `deepagents`/`langgraph` libraries. `user_chat`
  is a deterministic async pipeline, not a tool-loop agent. Rationale: a single
  non-handoff agent gains nothing from the library, and a fixed
  retrieve→compose pipeline *structurally* guarantees the "don't hallucinate"
  requirement and is trivially testable. Clean seam to adopt `deepagents` later when
  real multi-agent handoff exists.
- **Model:** `settings.openai_model` (`gpt-5.4-mini`, already the cheap mini tier) via
  the gateway; new env `OPENAI_CHAT_MODEL` overrides it without code changes.
- **Remember:** store the **question + answer** as one document, tagged
  `{project_id}::note::{message_id}`; idempotent via **dedup** (delete-by-exact-
  file_source then insert), not a persisted flag.
- **Persistence & privacy:** conversations are saved, resumable, and **private to the
  owning user**; each conversation is bound to a project.
- **No live Jira/Notion:** no handoff is exercised in this slice (the mechanism exists
  but `jira_notion` is not built here).

## Goals

- Project-scoped retrieval that returns passages with citation metadata and enforces a
  mandatory project filter (no cross-project leakage).
- Streaming chat answer composed **only** from retrieved context, with inline `[n]`
  citations; honest "not in the knowledge base" when context is empty (no
  hallucination, no LLM spend in the empty case).
- A "Remember" action that writes a Q+A note back into the project's RAG index,
  idempotently.
- Conversations persisted per user+project, listable and resumable, private to the
  owner.
- Every run recorded in the trace store; every LLM call recorded in `llm_usage`.

## Non-Goals

- No `deepagents`/`langgraph` dependency (deferred until real handoff is needed).
- No live Jira/Notion read or handoff in this slice.
- No `meeting_participation`/`jira_notion` agents (only the orchestrator scaffolding +
  `user_chat`).
- No query condensation / re-ranking beyond LightRAG's own retrieval in v1.
- No Alembic migration framework (bootstrap stays `create_all`, MVP convention).

## Architecture

Layers (all backend access to LightRAG/OpenAI stays behind app-owned modules):

```
Browser  ── ChatScreen (project_id from useActiveProject) ──┐
                                                            │ bearer JWT
backend/app/routers/chat.py  (POST /projects/{id}/chat, SSE)│
   └─ runtime/orchestrator.py  start_run(entry=user_chat) ──┘ → TraceRun
        └─ agents/user_chat.py  (gated services: rag.retrieve + llm only)
             ├─ rag.py  retrieve(project_id, q, k)         → tool step
             └─ llm.py  stream_chat(...)                   → llm step + LlmUsage
```

### Component map

| # | Component | File | Issue | New/reuse |
|---|-----------|------|-------|-----------|
| 1 | `retrieve()` + `Citation`/`RetrievedPassage` + exact-source delete | `backend/app/rag.py` | `o39` read half | extend existing |
| 2 | LLM gateway (streaming + usage logging) | `backend/app/llm.py` | `wqj` | new |
| 3 | Trace repository | `backend/app/repositories/trace.py` | `a27` | models exist; repo new |
| 4 | Orchestrator (contracts + allow-list + trace + handoff mechanism) | `backend/app/runtime/` | `die` | new |
| 5 | `user_chat` agent (deterministic pipeline) | `backend/app/agents/user_chat.py` | `n6h` | new |
| 6 | Remember (RAG write-back, `source_kind=note`) | router + `rag.py` | **new issue** | new |
| 7 | Chat router (SSE chat + remember + conversation history) + DI wiring | `backend/app/routers/chat.py`, `deps.py`, `main.py` | `2jb` chat slice | new |
| 8 | Frontend: real SSE in ChatScreen, citations, Remember, resumable history | `apps/web/components/screens/chat/*`, `apps/web/lib/api*` | `r0k` chat slice | rewrite mock |

Reused unchanged: `Conversation`/`Message` models (+`meta` JSON, `trace_run_id`),
`repositories/chat.py`, `TraceRun`/`TraceStep`, `LlmUsage`, `RagClient.index_documents`,
`deps.py` DI pattern, project membership guard (`membership.py`), `ChatScreen`/
`ChatMessage`/`ChatHistoryPane` layout.

## Component designs

### 1. RAG read side — `rag.py`

```python
@dataclass
class Citation:
    source_kind: str            # jira | notion | note | meeting | ...
    source_id: str
    title: str | None = None
    source_uri: str | None = None

@dataclass
class RetrievedPassage:
    text: str
    score: float
    citation: Citation

async def retrieve(self, project_id: str, question: str, *, k: int = 6) \
        -> list[RetrievedPassage]: ...

async def clear_source(self, project_id: str, source_kind: str, source_id: str) -> int:
    """Delete docs whose file_source == exactly '{project_id}::{kind}::{id}'."""
```

- `retrieve` calls LightRAG `POST /query` in **context-only** mode (`only_need_context`)
  so generation stays in our gateway. It maps each returned chunk to a
  `RetrievedPassage` and **drops any passage whose provenance `file_path` does not start
  with `"{project_id}::"`** — this is the mandatory project filter. A hit with no usable
  `file_path` is rejected (uncited → dropped), per o39 spec error handling.
- `Citation.source_kind`/`source_id` are parsed from `file_path`
  (`{project_id}::{kind}::{id}`); `title`/`source_uri` are best-effort from the indexed
  text header (`index_documents` writes `"{title}\n{source_uri}\n\n{text}"`).
- `clear_source` generalizes `_iter_project_docs` to match an exact `file_source`
  string; used by Remember for dedup.

### 2. LLM gateway — `llm.py` (`wqj`)

```python
class LlmGateway:
    @classmethod
    def from_settings(cls, settings) -> "LlmGateway": ...
    async def stream_chat(self, messages, *, system=None, temperature=0.2,
                          usage_sink=None) -> AsyncIterator[str]: ...   # token deltas
    async def complete(self, messages, ...) -> str: ...
```

- Thin wrapper over `langchain_openai.ChatOpenAI` (model = `OPENAI_CHAT_MODEL` or
  `settings.openai_model`). Fail-fast on missing `OPENAI_API_KEY` (already a required
  setting).
- Streaming via `.astream(...)` with `stream_usage=True`; the gateway writes one
  `LlmUsage` row per call (provider=openai, model, kind=llm, category="chat",
  input/output token units, `run_id`, `project_id`, context) so the existing Billing
  tab aggregates it. `usage_sink` is how the orchestrator/agent passes run+project
  attribution.

### 3. Trace repository — `repositories/trace.py` (`a27`)

```python
def start_run(db, *, entry_agent: str) -> TraceRun
def record_step(db, *, run_id, agent, kind: StepKind, input: dict|None,
                output: dict|None) -> TraceStep
def finish_run(db, *, run_id, status: RunStatus) -> None
def get_run(db, run_id) -> TraceRun | None
def list_steps(db, run_id) -> list[TraceStep]
```

Models (`TraceRun`/`TraceStep`, kinds llm/tool/handoff) already exist. This is the
write/read repo the orchestrator uses.

### 4. Orchestrator — `runtime/` (`die`, B2 flavor)

`runtime/contracts.py`:

```python
class AgentName(str, Enum): user_chat; meeting_participation; jira_notion
class RunMode(str, Enum): chat; meeting
@dataclass
class RunContext: project_id: str; user_id: int; conversation_id: str | None; run_id: str
@dataclass
class HandoffTarget: to: AgentName; payload: dict        # mechanism only; unused here

CAPABILITIES = {
    AgentName.user_chat:            {"rag.retrieve", "llm"},          # NO mcp/writes
    AgentName.meeting_participation:{"rag.index", "llm", "calendar"},
    AgentName.jira_notion:          {"mcp.jira", "mcp.notion", "llm"},
}
```

`runtime/orchestrator.py`:

```python
class CapabilityError(RuntimeError): ...

class GatedServices:
    """Exposes only the capabilities allow-listed for one agent; other access raises."""

class Orchestrator:
    def __init__(self, *, llm, rag, trace_factory): ...
    async def start_run(self, entry_agent: AgentName, ctx) -> str            # TraceRun id
    def services_for(self, agent: AgentName, ctx) -> GatedServices
    async def dispatch_handoff(self, frm: AgentName, to: AgentName, payload) # checks matrix, records handoff step; raises if illegal
    async def finish(self, run_id, status) -> None
```

- For this slice the orchestrator drives only `user_chat`, handing it a `GatedServices`
  exposing `rag.retrieve` + `llm.stream_chat`. Accessing anything else
  (`mcp`, external writes) raises `CapabilityError` — the testable `die` boundary.
- Records steps: `tool`(retrieve) and `llm`(compose). `handoff` only if dispatched.

### 5. `user_chat` agent — `agents/user_chat.py` (`n6h`)

Deterministic async generator (not a tool-loop):

```python
async def run(ctx, *, message, history, services) -> AsyncIterator[ChatEvent]:
    passages = await services.rag.retrieve(ctx.project_id, message, k=6)   # ALWAYS first
    if not passages:
        yield NoContextEvent()      # fixed message, NO llm call
        return
    prompt = build_grounded_prompt(passages, history, message)
    async for delta in services.llm.stream_chat(prompt, system=GROUNDED_SYSTEM,
                                                 temperature=0.2):
        yield TokenEvent(delta)
    yield CitationsEvent(passages_to_citations(passages))
```

- **Inputs:** user message + last ~10 messages of conversation history (multi-turn).
- **Grounded system prompt:** "Answer ONLY from the numbered context below. If it does
  not contain the answer, say you don't have it in the project knowledge base. Never
  invent. Cite sources inline as [n]."
- **Citations:** passages numbered `[1..k]` in the context block; the final
  `CitationsEvent` carries `[{n, source_kind, source_id, title, source_uri, score}]`.
- **Boundary:** `services` only exposes retrieve + llm (no writes), enforced by the
  orchestrator allow-list.

### 6. Remember — router + `rag.py` (new issue)

`POST /projects/{project_id}/chat/messages/{message_id}/remember`:

1. Load the assistant `Message` → its `Conversation`; assert `conv.user_id ==
   current_user.id` and `conv.project_id == project_id` (else 403/404).
2. Find the preceding user message in the same conversation for the question text.
3. Compose `"{question}\n\n{answer}"` as one `RagDocument(source_kind="note",
   source_id=str(message_id), title=question[:120], source_uri="")`.
4. **Dedup:** `rag.clear_source(project_id, "note", str(message_id))` then
   `rag.index_documents(project_id, [doc])`. Idempotent on repeat clicks.
5. Return `{track_id, status}`.

No persisted `remembered` flag — dedup makes re-remember safe; the UI shows a transient
confirmation.

### 7. Chat router + DI — `routers/chat.py`, `deps.py`, `main.py` (`2jb` chat slice)

Endpoints (all require `get_current_user` + project membership; conversation endpoints
additionally require `conversation.user_id == current_user.id`):

- `POST /projects/{project_id}/chat` → `text/event-stream`. Body `{message,
  conversation_id?}`.
  - Resolve/create conversation (`user_id`, `project_id`, `agent="user_chat"`,
    `title` = snippet of first message). If `conversation_id` given, assert ownership +
    project match.
  - Persist the user message; `start_run`; stream orchestrator events as SSE; on
    completion persist the assistant message (`content`, `meta={"citations": [...]}`,
    `trace_run_id`); `finish_run`.
- `POST /projects/{project_id}/chat/messages/{message_id}/remember` → `{track_id,
  status}` (see §6).
- `GET /projects/{project_id}/conversations` → list owned by current user in this
  project, newest first (`{id, title, updated_at}`).
- `GET /projects/{project_id}/conversations/{conversation_id}/messages` → ordered
  messages (`{id, role, content, meta, created_at}`) after ownership check.

DI: add `get_rag_client`, `get_llm_gateway`, `get_orchestrator` to `deps.py`
(mirroring `get_ingestion_runner`); register `chat.router` in `main.py`.

#### SSE wire format

Lines `data: {json}\n\n`; event discriminated by a `type` field (simpler than SSE
`event:` lines for the fetch-stream reader):

```
data: {"type":"meta","conversation_id":"…","run_id":"…"}
data: {"type":"token","delta":"Half"}
data: {"type":"token","delta":" the"}
data: {"type":"citations","items":[{"n":1,"source_kind":"jira","source_id":"PROJ-12","title":"…","source_uri":"…","score":0.81}]}
data: {"type":"done","message_id":1432}
data: {"type":"error","detail":"…"}      # on failure (also finishes run as failed)
```

The empty-context path needs no special event: the router serializes `NoContextEvent`
as a normal `token` stream carrying the fixed "not in the knowledge base" sentence,
then `citations` with `items: []`, then `done`. The assistant message is still
persisted (with empty citations) so the turn appears in resumed history.

### 8. Frontend — chat slice (`r0k` slice)

- `project_id = useActiveProject().activeProject.id`. Guard the empty/`__no-project__`
  state with an honest "select a project" message.
- Replace the `setTimeout` streaming simulation in `ChatScreen` with a `fetch` POST to
  the chat endpoint reading the response body stream (`EventSource` can't send the
  bearer header, so use `fetch` + `ReadableStream`), parsing `data:` lines:
  `token` appends to the streaming agent bubble; `citations` populates the existing
  `sources` rendering in `ChatMessage`; `done` finalizes; `error` shows a message.
- Add a **Remember** button on each final agent message → `POST …/remember`; show a
  transient "Saved to knowledge base" (always enabled; idempotent).
- Replace mock `SESSIONS`/`ChatHistoryPane` with real data: list conversations
  (`GET …/conversations`), open one to hydrate messages
  (`GET …/conversations/{id}/messages`) and continue it by sending with its
  `conversation_id`; "New session" starts a fresh conversation.
- Update the hardcoded subtitle ("model: claude-sonnet-4-6") to the real configured
  model / project.
- Extend the API client (`lib/api.ts` + a small SSE helper) — first real step of
  `r0k`.

## Data model change

`Conversation` gains a project binding (current model is per user+agent only):

```python
project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
# composite index (user_id, project_id) for listing
```

This is a deliberate extension of the 2026-06-01 chat-history model so chat is
project-scoped *and* private. No Alembic; the local bootstrap recreates the schema
(`create_all`). No production chat data exists yet, so no migration concern.

## Access control

- All chat endpoints require an authenticated user and project membership (reuse the
  existing `/projects/{id}` membership guard).
- Conversation-scoped endpoints additionally require `conversation.user_id ==
  current_user.id` and `conversation.project_id == project_id` → otherwise 404 (don't
  leak existence) / 403. A user can never read or continue another user's chat.

## Anti-hallucination guarantees

1. `retrieve()` always runs before any generation (pipeline order, not model choice).
2. Empty project-scoped context → fixed "not in the knowledge base" message, **no LLM
   call**.
3. Grounded system prompt restricts the model to the numbered context and forbids
   invention.
4. `temperature=0.2`.
5. Cross-project hits are dropped at the adapter; uncited hits are dropped.

## Trace & usage

- One `TraceRun` per chat turn (`entry_agent="user_chat"`), steps: `tool`(retrieve:
  in `{question,k}`, out `{n_passages}`), `llm`(compose: in `{model, passages,
  history_len}`, out `{usage}`), finish `completed`/`failed`. `Message.trace_run_id`
  links the persisted assistant message to its run.
- One `LlmUsage` row per compose call for the Billing tab.

## Dependencies

Add to `backend/requirements.txt`: `langchain-openai` (pulls `langchain-core`,
`openai`). **Not** `langgraph`/`deepagents`.

## Testing

- `rag.retrieve`: fake LightRAG client — project filter mandatory, cross-project hits
  dropped, uncited hits dropped, citation round-trip, timeout/error → `RagError`.
- `rag.clear_source`: deletes only the exact file_source.
- `llm.LlmGateway`: mock `ChatOpenAI` — streaming yields chunks, usage row written,
  fail-fast on missing key.
- `repositories/trace`: run/step lifecycle.
- `orchestrator`: allow-list — `user_chat` cannot access `mcp`/writes
  (`CapabilityError`); steps recorded; illegal handoff rejected.
- `user_chat`: mocked rag+llm — retrieve-first, empty-context path makes no LLM call,
  citations passed through, history fed.
- `routers/chat`: contract tests with `TestClient` — auth required; ownership
  enforced (other user's conversation → 404/403); SSE streams `token`/`citations`/
  `done`; remember dedup round-trip; conversation list/messages owner-scoped.
- Compose smoke (live LightRAG from `qjh`): retrieve returns project-scoped passages.

## Implementation slices (for the plan)

1. **Foundation** — `rag.retrieve` + `clear_source` (`o39`); `llm.py` (`wqj`);
   `repositories/trace.py` (`a27`).
2. **Runtime** — `runtime/contracts.py` + `orchestrator.py` (`die`).
3. **Agent** — `agents/user_chat.py` (`n6h`).
4. **API** — `Conversation.project_id` migration-by-recreate; `routers/chat.py`
   (chat SSE + remember + history) + DI + `main.py`; Remember issue.
5. **Frontend** — real SSE + citations + Remember + resumable history in `ChatScreen`;
   API client extension (`r0k` slice).
6. **E2E smoke** — browser chat against live LightRAG + OpenAI.

## Risks

- **LightRAG `/query` context-only response shape (v1.5.3):** must yield per-passage
  text + `file_path` (+ ideally score) so we can post-filter by project and cite.
  Verify against the live API at the start of slice 1; if only an assembled context
  string is available, the adapter parses references from it and rejects any
  passage lacking a usable `file_path`. Covered by fake-client TDD + the compose smoke.
- **Shared knowledge graph:** project isolation is reference-level (file_source
  prefix), not graph-level — a known limitation tracked on `o39`. The adapter post-
  filter is the enforcement point for this slice.
