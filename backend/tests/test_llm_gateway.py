from __future__ import annotations

import asyncio

from app.llm import LlmGateway


class _FakeChunk:
    def __init__(self, content: str, usage: dict | None = None):
        self.content = content
        self.usage_metadata = usage


class _FakeChatModel:
    def __init__(self, chunks):
        self._chunks = chunks
        self.seen_messages = None

    async def astream(self, messages, **kwargs):
        self.seen_messages = messages
        for c in self._chunks:
            yield c


def _gateway(model, recorded):
    return LlmGateway(model=model, usage_writer=lambda row: recorded.append(row))


def test_stream_chat_yields_token_deltas():
    model = _FakeChatModel([_FakeChunk("Half"), _FakeChunk(" the"), _FakeChunk(" team")])
    recorded = []
    gw = _gateway(model, recorded)

    async def run():
        return [d async for d in gw.stream_chat(
            [{"role": "user", "content": "hi"}], system="be grounded",
            run_id="r1", project_id="p1")]

    deltas = asyncio.run(run())
    assert deltas == ["Half", " the", " team"]
    assert model.seen_messages[0] == {"role": "system", "content": "be grounded"}


def test_stream_chat_writes_usage_row():
    model = _FakeChatModel([_FakeChunk("x", usage={"input_tokens": 1200, "output_tokens": 30})])
    recorded = []
    gw = _gateway(model, recorded)

    async def run():
        return [d async for d in gw.stream_chat(
            [{"role": "user", "content": "hi"}], run_id="r1", project_id="p1", context="chat")]

    asyncio.run(run())
    assert len(recorded) == 1
    row = recorded[0]
    assert row["project_id"] == "p1" and row["run_id"] == "r1"
    assert row["kind"] == "llm" and row["category"] == "chat"
    assert row["input_units"] == 1200 / 1_000_000 and row["output_units"] == 30 / 1_000_000
