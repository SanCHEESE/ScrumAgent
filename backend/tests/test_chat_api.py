from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.config import Settings
from app.main import app
from app.models import Project, ProjectCredential, ProjectMember, User
from app.models.types import ProjectRole
from app.security import create_access_token

SECRET = "router-test-secret"


def _settings() -> Settings:
    return Settings(_env_file=None, secret_key=SECRET, openai_api_key="k",
                    google_client_id="c", google_client_secret="s",
                    backend_base_url="http://testserver", allowed_domain="municorn.com")


def _auth(uid: int) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(uid), SECRET, extra={'env': 'production'})}"}


def _user(db, email="alice@municorn.com", sub="sub-alice") -> User:
    u = User(google_sub=sub, email=email, name="Alice")
    db.add(u); db.commit(); db.refresh(u)
    return u


def _project(db, owner) -> Project:
    p = Project(owner_id=owner.id, name="P", agent_email="a@municorn.com", google_connected=True)
    p.credential = ProjectCredential(google_refresh_token="rt")
    p.members.append(ProjectMember(user_id=owner.id, role=ProjectRole.member))
    db.add(p); db.commit(); db.refresh(p)
    return p


class _FakeOrch:
    def __init__(self, db):
        self._db = db
    async def start_run(self, agent, ctx):
        from app.repositories import trace as t
        run = t.start_run(self._db, entry_agent=agent.value); self._db.flush()
        ctx.run_id = run.id; return run.id
    def services_for(self, agent, ctx):
        return None
    def record(self, *a, **k): ...
    def finish(self, *a, **k):
        from app.models.types import RunStatus
        from app.repositories import trace as t
        t.finish_run(self._db, run_id=a[0], status=RunStatus.completed)


async def _fake_agent_run(ctx, *, message, history, services):
    from app.agents.user_chat import TokenEvent, CitationsEvent
    yield TokenEvent("Half ")
    yield TokenEvent("the team")
    yield CitationsEvent([{"n": 1, "source_kind": "jira", "source_id": "PLAT-12",
                           "title": "Login", "source_uri": "http://j/PLAT-12", "score": 0.9}])


@pytest.fixture
def client(db_session, monkeypatch):
    def _ov_db():
        yield db_session
    app.dependency_overrides[deps.get_settings] = _settings
    app.dependency_overrides[deps.get_db] = _ov_db
    app.dependency_overrides[deps.get_orchestrator] = lambda: _FakeOrch(db_session)
    monkeypatch.setattr("app.routers.chat.agent_run", _fake_agent_run)
    yield TestClient(app)
    app.dependency_overrides.clear()


def _sse_events(resp) -> list[dict]:
    return [json.loads(line[6:]) for line in resp.text.splitlines() if line.startswith("data: ")]


def test_chat_streams_tokens_citations_done_and_persists(client, db_session):
    user = _user(db_session); project = _project(db_session, user)
    resp = client.post(f"/projects/{project.id}/chat", headers=_auth(user.id), json={"message": "why?"})
    assert resp.status_code == 200
    events = _sse_events(resp)
    types = [e["type"] for e in events]
    assert types[0] == "meta"
    assert "token" in types and "citations" in types and types[-1] == "done"
    assert "".join(e["delta"] for e in events if e["type"] == "token") == "Half the team"
    from app.models.chat import Message, Conversation
    convo = db_session.query(Conversation).filter_by(user_id=user.id).one()
    assert convo.project_id == project.id
    msgs = db_session.query(Message).order_by(Message.id).all()
    assert [m.role.value for m in msgs] == ["user", "assistant"]
    assert msgs[1].meta["citations"][0]["source_id"] == "PLAT-12"
    assert msgs[1].trace_run_id is not None


def test_chat_requires_auth(client, db_session):
    user = _user(db_session); project = _project(db_session, user)
    resp = client.post(f"/projects/{project.id}/chat", json={"message": "x"})
    assert resp.status_code == 401


def test_chat_continues_existing_conversation(client, db_session):
    user = _user(db_session); project = _project(db_session, user)
    r1 = client.post(f"/projects/{project.id}/chat", headers=_auth(user.id), json={"message": "one"})
    cid = next(e for e in _sse_events(r1) if e["type"] == "meta")["conversation_id"]
    client.post(f"/projects/{project.id}/chat", headers=_auth(user.id),
                json={"message": "two", "conversation_id": cid})
    from app.models.chat import Conversation, Message
    assert db_session.query(Conversation).filter_by(user_id=user.id).count() == 1
    assert db_session.query(Message).count() == 4


def test_chat_rejects_other_users_conversation(client, db_session):
    owner = _user(db_session); project = _project(db_session, owner)
    r1 = client.post(f"/projects/{project.id}/chat", headers=_auth(owner.id), json={"message": "hi"})
    cid = next(e for e in _sse_events(r1) if e["type"] == "meta")["conversation_id"]
    intruder = _user(db_session, email="eve@municorn.com", sub="sub-eve")
    project.members.append(ProjectMember(user_id=intruder.id, role=ProjectRole.member))
    db_session.commit()
    resp = client.post(f"/projects/{project.id}/chat", headers=_auth(intruder.id),
                       json={"message": "steal", "conversation_id": cid})
    assert resp.status_code in (403, 404)
