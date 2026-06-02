from datetime import datetime, timezone

from app.models.meeting import Meeting, MeetingArtifact
from app.models.types import ArtifactType


def test_create_meeting_with_artifact(db_session):
    m = Meeting(
        google_event_id="evt-1",
        title="Standup",
        start=datetime(2026, 6, 1, 9, tzinfo=timezone.utc),
        organizer="alice@municorn.com",
        attendees=["alice@municorn.com", "bob@municorn.com"],
        has_meet=True,
    )
    db_session.add(m)
    db_session.flush()
    db_session.add(
        MeetingArtifact(
            meeting_id=m.id,
            type=ArtifactType.transcript,
            source="meet",
            content_ref="rag://evt-1/transcript",
        )
    )
    db_session.commit()

    got = db_session.query(Meeting).one()
    assert got.attendees == ["alice@municorn.com", "bob@municorn.com"]
    assert got.has_meet is True
    assert got.artifacts[0].type == ArtifactType.transcript
