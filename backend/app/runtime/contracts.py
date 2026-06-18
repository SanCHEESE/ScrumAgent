"""App-owned orchestration contracts (ScrumAgent-die).

The runtime is DeepAgents-inspired but app-owned: capability boundaries and
handoffs are enforced here, not by an external agent library. See
docs/superpowers/specs/2026-06-18-user-chat-rag-streaming-design.md."""
from __future__ import annotations

import enum
from dataclasses import dataclass


class AgentName(str, enum.Enum):
    user_chat = "user_chat"
    meeting_participation = "meeting_participation"
    jira_notion = "jira_notion"


class RunMode(str, enum.Enum):
    chat = "chat"
    meeting = "meeting"


@dataclass
class RunContext:
    project_id: str
    user_id: int
    conversation_id: str | None
    run_id: str


@dataclass
class HandoffTarget:
    to: AgentName
    payload: dict


# Capability allow-list per agent. user_chat is read-only over RAG + LLM; it can
# never index, call MCP, or make external writes (enforced in orchestrator.py).
CAPABILITIES: dict[AgentName, set[str]] = {
    AgentName.user_chat: {"rag.retrieve", "llm"},
    AgentName.meeting_participation: {"rag.index", "llm", "calendar"},
    AgentName.jira_notion: {"mcp.jira", "mcp.notion", "llm"},
}
