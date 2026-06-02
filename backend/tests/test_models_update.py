from app.models.trace import TraceRun
from app.models.types import RunStatus, UpdateStatus, UpdateTarget
from app.models.update import Update


def test_create_update_defaults_to_staged(db_session):
    run = TraceRun(entry_agent="orchestrator", status=RunStatus.completed)
    db_session.add(run)
    db_session.flush()
    upd = Update(
        target=UpdateTarget.jira,
        action="create_issue",
        payload={"summary": "Fix bug"},
        source_run_id=run.id,
    )
    db_session.add(upd)
    db_session.commit()

    got = db_session.query(Update).one()
    assert got.status == UpdateStatus.staged
    assert got.target == UpdateTarget.jira
    assert got.payload == {"summary": "Fix bug"}
    assert got.created_at is not None
