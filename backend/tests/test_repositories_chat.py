from app.models.project import Project
from app.models.types import MessageRole
from app.models.user import User
from app.repositories import chat as chat_repo


def _make_user(db, email, sub):
    u = User(google_sub=sub, email=email, name="U")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_project(db, owner):
    p = Project(
        owner_id=owner.id,
        name="P",
        agent_email="a@municorn.com",
        google_connected=True,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_create_conversation_binds_project_and_lists_by_owner(db_session):
    u1 = _make_user(db_session, "a@municorn.com", "s-a")
    u2 = _make_user(db_session, "b@municorn.com", "s-b")
    p1 = _make_project(db_session, u1)
    p2 = _make_project(db_session, u1)

    c1 = chat_repo.create_conversation(
        db_session, user_id=u1.id, project_id=p1.id, agent="user_chat", title="first"
    )
    chat_repo.create_conversation(
        db_session,
        user_id=u1.id,
        project_id=p2.id,
        agent="user_chat",
        title="other project",
    )
    chat_repo.create_conversation(
        db_session,
        user_id=u2.id,
        project_id=p1.id,
        agent="user_chat",
        title="other user",
    )
    db_session.commit()

    assert c1.project_id == p1.id

    mine = chat_repo.list_conversations(
        db_session, user_id=u1.id, project_id=p1.id
    )
    assert [c.title for c in mine] == ["first"]


def test_append_and_get_history_in_order(db_session):
    user = _make_user(db_session, "u@municorn.com", "s-u")
    project = _make_project(db_session, user)

    convo = chat_repo.create_conversation(
        db_session, user_id=user.id, project_id=project.id, agent="user_chat", title="t"
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
