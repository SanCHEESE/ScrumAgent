from app.models.types import MessageRole
from app.models.user import User
from app.repositories import chat as chat_repo


def test_append_and_get_history_in_order(db_session):
    user = User(google_sub="s", email="u@municorn.com")
    db_session.add(user)
    db_session.flush()

    convo = chat_repo.create_conversation(
        db_session, user_id=user.id, agent="user_chat", title="t"
    )
    chat_repo.append_message(
        db_session, conversation_id=convo.id, role=MessageRole.user, content="q1"
    )
    chat_repo.append_message(
        db_session,
        conversation_id=convo.id,
        role=MessageRole.assistant,
        content="a1",
    )
    chat_repo.append_message(
        db_session, conversation_id=convo.id, role=MessageRole.user, content="q2"
    )
    db_session.commit()

    history = chat_repo.get_history(db_session, convo.id)
    assert [m.content for m in history] == ["q1", "a1", "q2"]
    assert [m.role for m in history] == [
        MessageRole.user,
        MessageRole.assistant,
        MessageRole.user,
    ]
