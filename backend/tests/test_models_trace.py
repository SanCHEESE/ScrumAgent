from app.models.trace import TraceRun, TraceStep
from app.models.types import RunStatus, StepKind


def test_create_run_with_steps(db_session):
    run = TraceRun(entry_agent="orchestrator", status=RunStatus.running)
    db_session.add(run)
    db_session.flush()
    db_session.add(
        TraceStep(
            run_id=run.id,
            agent="jira_notion",
            kind=StepKind.tool,
            input={"q": "create issue"},
            output={"id": "JIRA-1"},
        )
    )
    db_session.commit()

    got = db_session.query(TraceRun).one()
    assert got.status == RunStatus.running
    assert got.started_at is not None
    assert got.steps[0].kind == StepKind.tool
    assert got.steps[0].output == {"id": "JIRA-1"}
