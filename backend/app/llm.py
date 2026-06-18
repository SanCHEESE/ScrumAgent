"""Single chokepoint for OpenAI calls (decision: OpenAI only). Agents never
import OpenAI directly. Streaming wrapper over langchain_openai.ChatOpenAI that
writes one llm_usage row per call for the Billing tab (ScrumAgent-307)."""
from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Sequence

from app.config import Settings
from app.models.types import UsageKind

# Usage units are millions of tokens (matches LlmUsage.input_units semantics).
_PER_MILLION = 1_000_000


class LlmGateway:
    def __init__(self, *, model, usage_writer: Callable[[dict], None] | None = None):
        self._model = model
        self._usage_writer = usage_writer

    @classmethod
    def from_settings(
        cls, settings: Settings, *, usage_writer: Callable[[dict], None] | None = None
    ) -> "LlmGateway":
        from langchain_openai import ChatOpenAI

        model = ChatOpenAI(
            model=settings.openai_chat_model or settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0.2,
            stream_usage=True,
        )
        return cls(model=model, usage_writer=usage_writer)

    def set_usage_writer(self, writer) -> None:
        """Set the per-run usage sink after construction (the router captures a
        request-local list)."""
        self._usage_writer = writer

    async def stream_chat(
        self,
        messages: Sequence[dict],
        *,
        system: str | None = None,
        run_id: str | None = None,
        project_id: str,
        context: str = "chat",
    ) -> AsyncIterator[str]:
        payload = list(messages)
        if system:
            payload = [{"role": "system", "content": system}, *payload]

        usage: dict | None = None
        async for chunk in self._model.astream(payload):
            meta = getattr(chunk, "usage_metadata", None)
            if meta:
                usage = meta
            content = getattr(chunk, "content", "")
            if content:
                yield content

        if self._usage_writer is not None:
            in_tok = (usage or {}).get("input_tokens", 0)
            out_tok = (usage or {}).get("output_tokens", 0)
            self._usage_writer(
                {
                    "project_id": project_id,
                    "run_id": run_id,
                    "context": context,
                    "provider": "openai",
                    "model": getattr(self._model, "model_name", None)
                    or getattr(self._model, "model", "unknown"),
                    "kind": UsageKind.llm,
                    "category": "chat",
                    "input_units": in_tok / _PER_MILLION,
                    "output_units": out_tok / _PER_MILLION,
                    "cost_usd": 0.0,
                }
            )
