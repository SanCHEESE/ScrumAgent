"""user_chat agent (ScrumAgent-n6h): deterministic RAG-grounded chat.

Pipeline is fixed (not a tool-loop): retrieve ALWAYS runs first, the answer is
composed only from retrieved context, and an empty context yields a fixed
"not in the knowledge base" reply with NO LLM call — anti-hallucination by
construction. Citations map answer markers [n] to passage provenance."""
from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.rag import RetrievedPassage
from app.runtime.contracts import RunContext

_MAX_HISTORY = 10
NO_CONTEXT_MESSAGE = (
    "I don't have anything about that in this project's knowledge base."
)
GROUNDED_SYSTEM = (
    "You answer questions about a software project using ONLY the numbered "
    "context passages provided. If the answer is not in the context, say you "
    "don't have it in the project knowledge base. Never invent facts. Cite the "
    "passages you use inline with their bracketed number, e.g. [1], [2]."
)


@dataclass
class TokenEvent:
    delta: str


@dataclass
class CitationsEvent:
    items: list[dict]


def _citations(passages: list[RetrievedPassage]) -> list[dict]:
    out = []
    for i, p in enumerate(passages, start=1):
        c = p.citation
        out.append({
            "n": i, "source_kind": c.source_kind, "source_id": c.source_id,
            "title": c.title, "source_uri": c.source_uri, "score": p.score,
        })
    return out


def _context_block(passages: list[RetrievedPassage]) -> str:
    lines = []
    for i, p in enumerate(passages, start=1):
        c = p.citation
        label = c.title or f"{c.source_kind}:{c.source_id}"
        lines.append(f"[{i}] ({label}) {p.text}")
    return "\n\n".join(lines)


async def run(
    ctx: RunContext, *, message: str, history: list[dict], services
) -> AsyncIterator[object]:
    passages = await services.rag.retrieve(ctx.project_id, message, k=6)
    if not passages:
        yield TokenEvent(NO_CONTEXT_MESSAGE)
        yield CitationsEvent([])
        return

    prompt_messages = [
        *history[-_MAX_HISTORY:],
        {
            "role": "user",
            "content": f"Context:\n{_context_block(passages)}\n\nQuestion: {message}",
        },
    ]
    async for delta in services.llm.stream_chat(
        prompt_messages, system=GROUNDED_SYSTEM,
        run_id=ctx.run_id, project_id=ctx.project_id,
    ):
        yield TokenEvent(delta)
    yield CitationsEvent(_citations(passages))
