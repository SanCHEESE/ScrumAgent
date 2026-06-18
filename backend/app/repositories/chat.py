"""Persistence helpers for user chat history."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.chat import Conversation, Message
from app.models.types import MessageRole


def create_conversation(
    db: Session,
    *,
    user_id: int,
    project_id: str,
    agent: str,
    title: str | None = None,
) -> Conversation:
    convo = Conversation(user_id=user_id, project_id=project_id, agent=agent, title=title)
    db.add(convo)
    db.flush()
    return convo


def list_conversations(
    db: Session, *, user_id: int, project_id: str
) -> list[Conversation]:
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user_id, Conversation.project_id == project_id)
        .order_by(Conversation.updated_at.desc())
    )
    return list(db.scalars(stmt))


def append_message(
    db: Session,
    *,
    conversation_id: str,
    role: MessageRole,
    content: str,
    meta: dict | None = None,
    trace_run_id: str | None = None,
) -> Message:
    convo = db.get(Conversation, conversation_id)
    if convo is not None:
        convo.updated_at = func.now()
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        meta=meta,
        trace_run_id=trace_run_id,
    )
    db.add(msg)
    db.flush()
    return msg


def get_history(db: Session, conversation_id: str) -> list[Message]:
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.id)
    )
    return list(db.scalars(stmt))
