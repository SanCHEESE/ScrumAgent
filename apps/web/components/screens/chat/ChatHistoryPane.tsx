import type { ChangeEvent, JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Session } from "./mock-responses";

export interface ChatHistoryPaneProps {
  sessions: Session[];
  activeSessionId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onCollapse: () => void;
  onNewSession: () => void;
  onOpenSession: (id: string) => void;
}

/**
 * Left rail listing prior chat sessions with search + "new session" affordance.
 * Filtering matches both title and preview, case-insensitive.
 */
export function ChatHistoryPane({
  sessions,
  activeSessionId,
  search,
  onSearchChange,
  onCollapse,
  onNewSession,
  onOpenSession,
}: ChatHistoryPaneProps): JSX.Element {
  const q = search.toLowerCase();
  const filtered = sessions.filter(
    (s) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.preview.toLowerCase().includes(q),
  );

  return (
    <aside className="chat-history-pane">
      <div className="chat-history-header">
        <div>
          <div
            className="mono muted"
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            history
          </div>
          <div className="chat-history-title">{sessions.length} sessions</div>
        </div>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          title="Collapse"
          onClick={onCollapse}
          type="button"
        >
          <Icon name="panel_left" size={14} />
        </button>
      </div>
      <div className="chat-history-search">
        <Icon name="search" size={13} />
        <input
          className="input-bare"
          placeholder="Search sessions…"
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onSearchChange(e.target.value)
          }
        />
      </div>
      <button className="chat-history-new" onClick={onNewSession} type="button">
        <Icon name="plus" size={14} /> New session
      </button>
      <div className="chat-history-list">
        {filtered.length === 0 && (
          <div className="muted" style={{ padding: "12px 16px", fontSize: 12 }}>
            No matches.
          </div>
        )}
        {filtered.map((s) => (
          <button
            key={s.id}
            className={`chat-history-item ${activeSessionId === s.id ? "active" : ""}`}
            onClick={() => onOpenSession(s.id)}
            type="button"
          >
            <div className="chat-history-item-top">
              <span className="chat-history-item-title">{s.title}</span>
              {s.active && <span className="chat-history-item-dot" />}
            </div>
            <div className="chat-history-item-preview">{s.preview}</div>
            <div className="chat-history-item-meta mono">
              {s.ts} · {s.msgs} msg
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
