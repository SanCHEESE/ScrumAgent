# RAG auto-heal — design

**Issue:** ScrumAgent-clo · **Follow-up to:** ScrumAgent-vw3 · **Date:** 2026-06-18

## Problem

When LightRAG marks documents `FAILED` during embedding (e.g. transient OpenAI
rate-limit backoff under a large backlog — the eSIM incident: 493/2626 docs failed),
the app has **no recovery path short of a destructive full resync** (`clear_project`
+ re-fetch from Jira/Notion + re-index). Worse, those embedding failures never
surface in the `IngestionRun` status, because `index_documents` only *submits*
(returns a `track_id`); the app doesn't track LightRAG's post-submit processing.

The user's framing: *"why can't it just re-sync the failed issues in place and not
report an error?"* — correct. LightRAG exposes `POST /documents/reprocess_failed`,
which re-embeds only the failed docs **in place** (no wipe, no re-fetch). That is the
cheap, targeted recovery; a full resync is only needed to pick up **edits** in Jira/
Notion (LightRAG has no upsert).

## Goal

A periodic **global** heal that recovers failed docs automatically and silently,
reserving destructive resync for edit-pickup — and never hammering a permanently-
failing backend (e.g. no embedding access, ScrumAgent-x0f).

## Key constraint (verified live)

`POST /documents/reprocess_failed` and `GET /documents/status_counts` are
**instance-wide** — no project filter, no request body. So the heal is a single
**global** operation, not per-project. Healing other projects' failed docs too is
harmless/beneficial. (`status_counts` shape: `{"status_counts": {"failed": N, ...}}`,
the `failed` key is absent when zero.)

## Design

### `app/rag.py` — two new `RagClient` methods

- `failed_count() -> int` — `GET /documents/status_counts`; returns global
  `status_counts.failed` (0 if absent). Raises `RagError` on transport / parse error.
- `reprocess_failed() -> None` — `POST /documents/reprocess_failed`; `raise_for_status`.
  Raises `RagError` on transport / non-2xx. Caller guarantees the pipeline is idle.

Both follow the existing per-call `client_factory()` + `_params()` + `RagError`-wrap
pattern.

### `app/auto_sync.py` — pure throttle + async heal step

```python
@dataclass
class HealState:           # in-memory; resets on process restart (fine — restart re-attempts)
    attempts: int = 0
    last_failed: int = 0

def decide_heal(failed, state, *, max_attempts) -> bool:
    # failed == 0      -> reset episode, return False
    # failed < last    -> progress; attempts = 1, return True
    # no progress      -> attempts += 1; give up (return False) once attempts >= max_attempts
    # (mutates state, returns whether to reprocess now)

async def heal_failed_docs(rag, state, *, max_attempts) -> bool:
    # 1. if await rag.pipeline_busy(): return False           (heal waits for idle, like resync)
    # 2. failed = await rag.failed_count()
    # 3. if not decide_heal(failed, state, max_attempts): return False
    # 4. await rag.reprocess_failed(); log info; return True
    # best-effort: any RagError is logged and swallowed -> returns False (never kills the tick)
```

Throttle behaviour:
- **Transient overload** → reprocess once, converges, `failed` hits 0, episode resets.
- **Partial progress** (493→100→0) → progress resets patience, keeps healing.
- **Permanent failure** (N docs, no access) → reprocess `max_attempts` times, then stop;
  docs remain visible in the health `failed` count (honest, no infinite OpenAI spend).

### `app/auto_sync.py` — `AutoSyncScheduler` wiring

- New optional injected collaborator `rag=None`. `None` ⇒ heal off (keeps existing
  tests green; they exercise only scheduling). Production lifespan passes
  `RagClient.from_settings(settings)`.
- `__init__` holds `self._heal_state = HealState()`.
- `_loop` (per tick, before `run_due_syncs`):
  ```python
  healed = False
  if self._rag is not None and self._settings.rag_heal_enabled:
      healed = await heal_failed_docs(self._rag, self._heal_state,
                                      max_attempts=self._settings.rag_heal_max_attempts)
  if not healed:
      run_due_syncs(...)        # a tick that healed skips resync — pipeline now busy
  ```

### `app/config.py`

- `rag_heal_enabled: bool = True`
- `rag_heal_max_attempts: int = 3`

## Already covered — explicitly NOT changed

- **"Jira/Notion unreachable" stays a real error** — `execute_run` already isolates
  per-source fetch failures into `partial`/`failed` + `errors`.
- **Transient embedding failures aren't reported as a run error** — already true
  (submit-only); heal now actively recovers them.
- **`clear_project failed: busy` no longer a scary error** — already `deferred` (vw3).
- **Destructive resync** stays only on the 6h cadence / manual "Sync now".

## Out of scope (YAGNI)

- Surfacing exhausted-heal as a new UI warning field — the health `failed` count
  already shows it.
- Per-project heal (the endpoint is global; not worth faking project scope).
- Closing the submit-vs-processed loop synchronously inside `execute_run` (would make
  runs long-running; the periodic heal converges instead).
- Multi-process coordination (same single-process assumption as the existing scheduler).

## Tests (TDD)

- `test_rag_adapter.py`: `failed_count` reads `status_counts.failed` (and 0 when absent);
  `reprocess_failed` POSTs the endpoint; both raise `RagError` on HTTP error.
- `test_auto_sync.py`: `decide_heal` converge / permanent-give-up-after-N / progress-keeps-going /
  reset-on-zero; `heal_failed_docs` on a FakeRag — heals when idle+failed>0, skips when busy,
  gives up after N, swallows `RagError`; scheduler with an injected FakeRag runs heal and
  **skips** resync scheduling on a healed tick; existing scheduling tests stay green.
