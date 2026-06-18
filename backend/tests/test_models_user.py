import pytest
from sqlalchemy.exc import IntegrityError

from app.models.chat import Conversation
from app.models.project import Project
from app.models.user import User


def test_create_and_read_user(db_session):
    db_session.add(User(google_sub="sub-1", email="alice@municorn.com", name="Alice"))
    db_session.commit()
    got = db_session.query(User).filter_by(google_sub="sub-1").one()
    assert isinstance(got.id, int)
    assert got.email == "alice@municorn.com"
    assert got.created_at is not None


def test_google_sub_unique(db_session):
    db_session.add(User(google_sub="dup", email="a@municorn.com"))
    db_session.commit()
    db_session.add(User(google_sub="dup", email="b@municorn.com"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_user_conversations_relationship(db_session):
    user = User(google_sub="s", email="u@municorn.com")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    project = Project(
        owner_id=user.id,
        name="P",
        agent_email="a@municorn.com",
        google_connected=True,
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    convo = Conversation(user_id=user.id, project_id=project.id, agent="user_chat")
    db_session.add(convo)
    db_session.commit()
    assert user.conversations == [convo]
    assert convo.user is user
