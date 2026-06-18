import { API_BASE, getToken } from "./auth";
import type { ChatCitation } from "./api";

export type ChatEvent =
  | { type: "meta"; conversation_id: string; run_id: string }
  | { type: "token"; delta: string }
  | { type: "citations"; items: ChatCitation[] }
  | { type: "done"; message_id: number }
  | { type: "error"; detail: string };

/**
 * POST a chat message and stream the SSE response. EventSource can't send the
 * bearer header, so we read the response body with a ReadableStream reader and
 * parse `data: {json}\n\n` frames.
 */
export async function streamChat(
  projectId: string,
  body: { message: string; conversation_id?: string },
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/projects/${projectId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) throw new Error(`chat failed (${resp.status})`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as ChatEvent);
    }
  }
}
