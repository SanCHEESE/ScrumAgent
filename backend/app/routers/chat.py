"""Chat router (ScrumAgent-2jb chat slice): SSE chat. JWT + project membership
required; conversation endpoints additionally require the conversation to belong
to the current user."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.user_chat import CitationsEvent, TokenEvent
from app.agents.user_chat import run as agent_run
from app.deps import get_current_user, get_db, get_orchestrator
from app.models import Project, User
from app.models.chat import Conversation, Message
from app.models.types import MessageRole, RunStatus, StepKind
from app.models.usage import LlmUsage
from app.repositories import chat as chat_repo
from app.routers.projects import require_project_access
from app.runtime.contracts import AgentName, RunContext

router = APIRouter(prefix="/projects/{project_id}", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


class ConversationOut(BaseModel):
    id: str
    title: str | None
    updated_at: str


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    meta: dict | None
    created_at: str


def _owned_conversation(db, *, conversation_id, user, project_id) -> Conversation:
    convo = db.get(Conversation, conversation_id)
    if convo is None or convo.user_id != user.id or convo.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return convo


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/chat")
async def chat(
    project_id: str,
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project: Project = Depends(require_project_access),  # 404 if not a member
    orchestrator=Depends(get_orchestrator),
) -> StreamingResponse:
    if body.conversation_id:
        convo = _owned_conversation(db, conversation_id=body.conversation_id,
                                    user=user, project_id=project_id)
    else:
        convo = chat_repo.create_conversation(
            db, user_id=user.id, project_id=project_id, agent="user_chat",
            title=body.message[:80])
    chat_repo.append_message(db, conversation_id=convo.id, role=MessageRole.user,
                             content=body.message)
    history = [
        {"role": m.role.value, "content": m.content}
        for m in chat_repo.get_history(db, convo.id)
        if m.role in (MessageRole.user, MessageRole.assistant)
    ][:-1]  # exclude the message just appended; it's passed to the agent explicitly
    # db stays open for the whole stream: FastAPI tears down yield-deps only after StreamingResponse is fully sent.
    db.commit()

    async def stream() -> AsyncIterator[str]:
        ctx = RunContext(project_id=project_id, user_id=user.id,
                         conversation_id=convo.id, run_id="")
        run_id = ""
        try:
            run_id = await orchestrator.start_run(AgentName.user_chat, ctx)
            yield _sse({"type": "meta", "conversation_id": convo.id, "run_id": run_id})
            usage_rows: list[dict] = []
            services = orchestrator.services_for(AgentName.user_chat, ctx)
            if services is not None and getattr(services, "llm", None) is not None:
                services.llm.set_usage_writer(usage_rows.append)
            text_parts: list[str] = []
            citations: list[dict] = []
            async for event in agent_run(ctx, message=body.message,
                                         history=history, services=services):
                if isinstance(event, TokenEvent):
                    text_parts.append(event.delta)
                    yield _sse({"type": "token", "delta": event.delta})
                elif isinstance(event, CitationsEvent):
                    citations = event.items
                    yield _sse({"type": "citations", "items": event.items})
            msg = chat_repo.append_message(
                db, conversation_id=convo.id, role=MessageRole.assistant,
                content="".join(text_parts), meta={"citations": citations},
                trace_run_id=run_id)
            for row in usage_rows:
                db.add(LlmUsage(**row))
            orchestrator.record(run_id, AgentName.user_chat, StepKind.tool,
                                {"question": body.message, "k": 6},
                                {"n_passages": len(citations)})
            orchestrator.record(run_id, AgentName.user_chat, StepKind.llm,
                                {"history_len": len(history)},
                                {"chars": len("".join(text_parts))})
            orchestrator.finish(run_id, RunStatus.completed)
            db.commit()
            yield _sse({"type": "done", "message_id": msg.id})
        except Exception as exc:  # surface as a stream error, mark run failed
            if run_id:
                orchestrator.finish(run_id, RunStatus.failed)
            db.commit()
            yield _sse({"type": "error", "detail": str(exc)})

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project: Project = Depends(require_project_access),
):
    rows = chat_repo.list_conversations(db, user_id=user.id, project_id=project_id)
    return [
        ConversationOut(id=c.id, title=c.title, updated_at=c.updated_at.isoformat())
        for c in rows
    ]


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(
    project_id: str,
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    project: Project = Depends(require_project_access),
):
    convo = _owned_conversation(db, conversation_id=conversation_id, user=user,
                                project_id=project_id)
    return [
        MessageOut(id=m.id, role=m.role.value, content=m.content, meta=m.meta,
                   created_at=m.created_at.isoformat())
        for m in chat_repo.get_history(db, convo.id)
    ]
