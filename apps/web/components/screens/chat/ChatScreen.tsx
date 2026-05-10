"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { JSX, KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ChatHistoryPane } from "./ChatHistoryPane";
import { ChatMessage } from "./ChatMessage";
import {
  CHAT_SEED,
  SESSIONS,
  nowHHMM,
  pickResponse,
  type Message,
} from "./mock-responses";

/**
 * Top-level chat screen. Owns:
 *  - the message list & streaming simulation (setTimeout-driven)
 *  - history pane state (search, active session, collapse)
 *  - composer input + Enter-to-send wiring
 *  - seed-from-URL auto-send (Home screen links to /chat?seed=…)
 *
 * Streaming uses a generation ref + a tracked Set of pending timers so a new
 * send (or unmount) can cancel in-flight chunks cleanly without leaking
 * state into the next response.
 */
export function ChatScreen(): JSX.Element {
  const [messages, setMessages] = useState<Message[]>(CHAT_SEED);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>("s1");
  const [historySearch, setHistorySearch] = useState<string>("");
  const [historyCollapsed, setHistoryCollapsed] = useState<boolean>(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // All pending timers from the current send(); cleared on cancel/unmount.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // Bumps on every send() / cancel() so older timer callbacks become no-ops.
  const generationRef = useRef<number>(0);

  const cancelStreaming = useCallback((): void => {
    generationRef.current += 1;
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current.clear();
  }, []);

  const schedule = useCallback(
    (cb: () => void, ms: number): void => {
      const gen = generationRef.current;
      const handle = setTimeout(() => {
        timersRef.current.delete(handle);
        if (gen !== generationRef.current) return;
        cb();
      }, ms);
      timersRef.current.add(handle);
    },
    [],
  );

  // Always cancel pending timers when the component unmounts.
  useEffect(() => {
    return () => {
      cancelStreaming();
    };
  }, [cancelStreaming]);

  // Auto-scroll the chat surface as new messages / chunks arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Reset any in-flight stream before starting a new one.
      cancelStreaming();

      const ts = nowHHMM();
      const responseTs = nowHHMM();
      const response = pickResponse(trimmed);

      setInput("");
      setStreaming(true);
      setMessages((m) => [
        ...m,
        { role: "user", text: trimmed, ts, final: true },
        {
          role: "agent",
          text: "",
          ts: responseTs,
          final: false,
          actions: [],
          sources: [],
          toolUse: null,
        },
      ]);

      // Walk through agent actions one by one before the prose stream begins.
      let actionIdx = 0;
      const showActions = (): void => {
        const actions = response.actions ?? [];
        if (actionIdx >= actions.length) {
          streamText();
          return;
        }
        schedule(() => {
          const action = actions[actionIdx];
          if (!action) return;
          setMessages((m) => {
            const next = [...m];
            const last = next[next.length - 1];
            if (!last || last.role !== "agent") return m;
            next[next.length - 1] = {
              ...last,
              actions: [...(last.actions ?? []), action],
            };
            return next;
          });
          actionIdx += 1;
          showActions();
        }, 500);
      };

      const streamText = (): void => {
        let chunkIdx = 0;
        const pushChunk = (): void => {
          if (chunkIdx >= response.chunks.length) {
            // Final pass: attach sources / followups / tool-use, mark final.
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (!last || last.role !== "agent") return m;
              next[next.length - 1] = {
                ...last,
                sources: response.sources ?? [],
                followups: response.followups ?? [],
                toolUse: response.toolUse ?? null,
                needsConfirm: !!response.needsConfirm,
                final: true,
              };
              return next;
            });
            setStreaming(false);
            return;
          }
          const chunk = response.chunks[chunkIdx];
          if (chunk === undefined) return;
          setMessages((m) => {
            const next = [...m];
            const last = next[next.length - 1];
            if (!last || last.role !== "agent") return m;
            next[next.length - 1] = {
              ...last,
              text: (last.text ?? "") + chunk,
            };
            return next;
          });
          chunkIdx += 1;
          schedule(pushChunk, 140 + Math.random() * 100);
        };
        schedule(pushChunk, 300);
      };

      schedule(showActions, 300);
    },
    [cancelStreaming, schedule],
  );

  // Seed query auto-send: read once on mount.
  const searchParams = useSearchParams();
  const sentSeedRef = useRef<boolean>(false);
  useEffect(() => {
    if (sentSeedRef.current) return;
    const seed = searchParams?.get("seed");
    if (seed && seed.trim()) {
      sentSeedRef.current = true;
      send(seed);
    } else {
      // Mark so we don't re-trigger if the param later disappears.
      sentSeedRef.current = true;
    }
    // We intentionally only run this once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback((): void => {
    if (input.trim() && !streaming) send(input.trim());
  }, [input, streaming, send]);

  const onComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const startNewSession = useCallback((): void => {
    cancelStreaming();
    setMessages(CHAT_SEED);
    setInput("");
    setStreaming(false);
    setActiveSessionId(null);
  }, [cancelStreaming]);

  const openSession = useCallback((id: string): void => {
    setActiveSessionId(id);
    // In a real app we'd hydrate the session's messages here.
  }, []);

  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1] : undefined;
  const showFollowups =
    !streaming &&
    !!lastMessage &&
    lastMessage.role === "agent" &&
    lastMessage.final &&
    !!lastMessage.followups &&
    lastMessage.followups.length > 0;

  return (
    <div
      className={`chat-screen chat-with-history ${historyCollapsed ? "history-collapsed" : ""}`}
    >
      <ChatHistoryPane
        sessions={SESSIONS}
        activeSessionId={activeSessionId}
        search={historySearch}
        onSearchChange={setHistorySearch}
        onCollapse={() => setHistoryCollapsed(true)}
        onNewSession={startNewSession}
        onOpenSession={openSession}
      />

      {historyCollapsed && (
        <button
          className="chat-history-reopen"
          onClick={() => setHistoryCollapsed(false)}
          title="Show history"
          type="button"
        >
          <Icon name="panel_left" size={14} />
        </button>
      )}

      <div className="chat-main">
        <div className="chat-header">
          <div>
            <div className="chat-title">
              <span className="chat-title-dot" />
              Agent <em>session</em>
            </div>
            <div className="chat-subtitle mono muted">
              project: platform · rag: 142k chunks · model: claude-sonnet-4-6
            </div>
          </div>
          <div className="hstack">
            <button
              className="btn btn-secondary btn-sm"
              onClick={startNewSession}
              type="button"
            >
              New session
            </button>
          </div>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {messages.map((m, i) => (
              <ChatMessage key={i} message={m} />
            ))}
            {showFollowups && lastMessage?.followups && (
              <div className="chat-followups">
                {lastMessage.followups.map((f, i) => (
                  <button
                    key={i}
                    className="followup-chip"
                    onClick={() => send(f)}
                    type="button"
                  >
                    {f} <Icon name="arrow_right" size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="chat-composer-wrap">
          <div className="chat-composer">
            <textarea
              className="chat-composer-input"
              placeholder="Message ScrumAgent — Shift+Enter for newline"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={1}
            />
            <div className="chat-composer-tools">
              <button className="btn btn-ghost btn-sm" type="button">
                <Icon name="plus" size={14} />
              </button>
              <button className="btn btn-ghost btn-sm" type="button">
                Context: <strong>last 10 meetings</strong>{" "}
                <Icon name="chevron_down" size={12} />
              </button>
              <div className="spacer" />
              <span className="mono muted" style={{ fontSize: 11 }}>
                ⌘↵ send
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={submit}
                disabled={streaming || !input.trim()}
                type="button"
              >
                {streaming ? (
                  "Streaming…"
                ) : (
                  <>
                    <Icon name="send" size={14} /> Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
