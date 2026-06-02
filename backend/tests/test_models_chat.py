import pytest
from sqlalchemy.exc import IntegrityError

from app.models.chat import Conversation, Message
from app.models.types import MessageRole
from app.models.user import User


def _user(db):
    u = User(google_sub="sub-1", email="u@municorn.com")
    db.add(u)
    db.flush()
    return u


def test_create_conversation_and_message(db_session):
    user = _user(db_session)
    convo = Conversation(user_id=user.id, agent="user_chat", title="hi")
    db_session.add(convo)
    db_session.flush()
    msg = Message(
        conversation_id=convo.id,
        role=MessageRole.user,
        content="hello",
        meta={"tokens": 3},
    )
    db_session.add(msg)
    db_session.commit()

    got = db_session.query(Message).one()
    assert got.id == 1  # integer autoincrement PK
    assert got.role == MessageRole.user
    assert got.content == "hello"
    assert got.meta == {"tokens": 3}
    assert convo.messages == [got]


def test_message_fk_integrity_enforced(db_session):
    # dangling conversation_id must be rejected (proves SQLite FK pragma is on)
    db_session.add(
        Message(conversation_id="nope", role=MessageRole.user, content="x")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
