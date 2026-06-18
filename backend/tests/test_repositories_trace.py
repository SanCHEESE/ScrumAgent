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
