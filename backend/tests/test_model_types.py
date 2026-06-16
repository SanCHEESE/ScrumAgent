from app.models.types import (
    ArtifactType,
    MessageRole,
    ProjectRole,
    RunStatus,
    StepKind,
    UpdateStatus,
    UpdateTarget,
    uuid_str,
)


def test_uuid_str_is_36_chars():
    value = uuid_str()
    assert isinstance(value, str)
    assert len(value) == 36


def test_enum_values():
    assert MessageRole.user.value == "user"
    assert {r.value for r in MessageRole} == {"user", "assistant", "system", "tool"}
    assert {a.value for a in ArtifactType} == {"transcript", "notes", "recording"}
    assert {t.value for t in UpdateTarget} == {"jira", "notion"}
    assert {s.value for s in UpdateStatus} == {
        "staged",
        "approved",
        "rejected",
        "applied",
    }
    assert {k.value for k in StepKind} == {"llm", "tool", "handoff"}
    assert {s.value for s in RunStatus} == {"running", "completed", "failed"}
    assert {r.value for r in ProjectRole} == {"viewer", "member", "admin"}
