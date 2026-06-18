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
import { useActiveProject } from "@/components/shell/ActiveProjectProvider";
import { api } from "@/lib/api";
import type { ChatCitation, ConversationRow, ChatMessageRow } from "@/lib/api";
import { streamChat } from "@/lib/chat-stream";
import { ChatHistoryPane } from "./ChatHistoryPane";
import { ChatMessage } from "./ChatMessage";
import {
  CHAT_SEED,
  nowHHMM,
  type Message,
  type Session,
  type Source,
} from "./mock-responses";

/**
 * Map a backend ChatCitation to the Source shape ChatMessage renders.
 * Source = { type: SourceType, name: string }
 * SourceType = "meeting" | "transcript" | "notion" | "file"
 */
function citationToSource(c: ChatCitation): Source {
  const kindMap: Record<string, Source["type"]> = {
    meeting: "meeting",
    transcript: "transcript",
    notion: "notion",
    file: "file",
  };
  const type: Source["type"] = kindMap[c.source_kind] ?? "file";
  const name = c.title ?? `${c.source_kind}:${c.source_id}`;
  return { type, name };
}

/** Map a ConversationRow to the Session shape ChatHistoryPane renders. */
function convRowToSession(row: ConversationRow): Session {
  // Format the updated_at timestamp to a readable label
  const date = new Date(row.updated_at);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  let tsLabel: string;
  if (isToday) {
    tsLabel = `Today · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (isYesterday) {
    tsLabel = `Yesterday · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    tsLabel = date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return {
    id: row.id,
    title: row.title ?? "Untitled session",
    preview: "",
    ts: tsLabel,
    msgs: 0,
  };
}

/** Map backend ChatMessageRow[] to the local Message[] shape. */
function rowsToMessages(rows: ChatMessageRow[]): Message[] {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => {
      const ts = new Date(r.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (r.role === "user") {
        return { role: "user" as const, text: r.content, ts, final: true };
      }
      // assistant
      const citations = r.meta?.citations ?? [];
      return {
        role: "agent" as const,
        text: r.content,
        ts,
        final: true,
        sources: citations.map(citationToSource),
        dbId: r.id,
      };
    });
}

/**
 * Top-level chat screen. Owns:
 *  - the message list & SSE streaming (via streamChat)
 *  - history pane state (search, active session, collapse)
 *  - composer input + Enter-to-send wiring
 *  - seed-from-URL auto-send (Home screen links to /chat?seed=…)
 *
 * Streaming uses a generation ref so a new send supersedes the previous one
 * cleanly without leaking state into the next response.
 */
export function ChatScreen(): JSX.Element {
  const { activeProject } = useActiveProject();
  const projectId = activeProject.id;
  const noProject = projectId === "__no-project__";

  const [messages, setMessages] = useState<Message[]>(CHAT_SEED);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [historySearch, setHistorySearch] = useState<string>("");
  const [historyCollapsed, setHistoryCollapsed] = useState<boolean>(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Bumps on every send() / cancel() so older SSE callbacks become no-ops.
  const generationRef = useRef<number>(0);
  // Tracks the current conversation id across the session.
  const conversationIdRef = useRef<string | null>(null);

  const cancelStreaming = useCallback((): void => {
    generationRef.current += 1;
  }, []);

  // Always cancel pending stream when the component unmounts.
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

  // Load conversation list whenever the active project changes.
  const loadConversations = useCallback((): void => {
    if (noProject) {
      setSessions([]);
      return;
    }
    api
      .listConversations(projectId)
      .then((rows) => setSessions(rows.map(convRowToSession)))
      .catch(() => {
        // Non-fatal — history pane just shows empty
      });
  }, [projectId, noProject]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed || noProject) return;
      // Reset any in-flight stream before starting a new one.
      cancelStreaming();
      const gen = generationRef.current;

      const ts = nowHHMM();
      const responseTs = nowHHMM();

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
          sources: [],
          dbId: null,
        },
      ]);

      streamChat(
        projectId,
        {
          message: trimmed,
          conversation_id: conversationIdRef.current ?? undefined,
        },
        (e) => {
          if (gen !== generationRef.current) return;

          if (e.type === "meta") {
            conversationIdRef.current = e.conversation_id;
          } else if (e.type === "token") {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (!last || last.role !== "agent") return m;
              next[next.length - 1] = {
                ...last,
                text: (last.text ?? "") + e.delta,
              };
              return next;
            });
          } else if (e.type === "citations") {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (!last || last.role !== "agent") return m;
              next[next.length - 1] = {
                ...last,
                sources: e.items.map(citationToSource),
              };
              return next;
            });
          } else if (e.type === "done") {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (!last || last.role !== "agent") return m;
              next[next.length - 1] = {
                ...last,
                final: true,
                dbId: e.message_id,
              };
              return next;
            });
            setStreaming(false);
            // Refresh history list after a completed turn
            loadConversations();
          } else if (e.type === "error") {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (!last || last.role !== "agent") return m;
              next[next.length - 1] = {
                ...last,
                text: `⚠️ ${e.detail}`,
                final: true,
              };
              return next;
            });
            setStreaming(false);
          }
        },
      ).catch((err: unknown) => {
        if (gen !== generationRef.current) return;
        const detail =
          err instanceof Error ? err.message : "Unexpected error";
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (!last || last.role !== "agent") return m;
          next[next.length - 1] = {
            ...last,
            text: `⚠️ ${detail}`,
            final: true,
          };
          return next;
        });
        setStreaming(false);
      });
    },
    [cancelStreaming, projectId, noProject, loadConversations],
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
    conversationIdRef.current = null;
    setMessages(CHAT_SEED);
    setInput("");
    setStreaming(false);
    setActiveSessionId(null);
  }, [cancelStreaming]);

  const openSession = useCallback(
    (id: string): void => {
      if (noProject) return;
      cancelStreaming();
      setStreaming(false);
      setActiveSessionId(id);
      conversationIdRef.current = id;
      const targetId = id;
      api
        .getMessages(projectId, id)
        .then((rows) => {
          if (conversationIdRef.current !== targetId) return; // a newer session was opened; drop this stale result
          setMessages(rowsToMessages(rows));
        })
        .catch(() => {
          // On error, leave messages as-is rather than crashing
        });
    },
    [projectId, noProject, cancelStreaming],
  );

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
        sessions={sessions}
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
              {noProject
                ? "select a project to start chatting"
                : `project: ${activeProject.name}`}
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
            {noProject && (
              <div
                className="muted"
                style={{ padding: "24px 16px", textAlign: "center", fontSize: 13 }}
              >
                Select a project to start chatting with ScrumAgent.
              </div>
            )}
            {messages.map((m, i) => (
              <ChatMessage key={m.dbId != null ? `db-${m.dbId}` : `ix-${i}`} message={m} />
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
              placeholder={
                noProject
                  ? "Select a project first…"
                  : "Message ScrumAgent — Shift+Enter for newline"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={1}
              disabled={noProject}
            />
            <div className="chat-composer-tools">
              <button className="btn btn-ghost btn-sm" type="button" disabled={noProject}>
                <Icon name="plus" size={14} />
              </button>
              <button className="btn btn-ghost btn-sm" type="button" disabled={noProject}>
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
                disabled={noProject || streaming || !input.trim()}
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
