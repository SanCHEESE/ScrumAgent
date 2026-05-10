import type { JSX } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { PARTICIPANTS } from "@/lib/mock-data";
import type { Message, Source } from "./mock-responses";
import { StreamingText } from "./StreamingText";
import { ToolUseCard } from "./ToolUseCard";

export interface ChatMessageProps {
  message: Message;
}

/**
 * Renders a single user or agent message. Agent messages compose the action
 * trace, streaming text body, optional tool-use card, and source chips. User
 * messages collapse to a single bubble + meta footer.
 */
export function ChatMessage({ message: m }: ChatMessageProps): JSX.Element {
  if (m.role === "user") {
    const alice = PARTICIPANTS.alice;
    return (
      <div className="msg msg-user">
        <div className="msg-bubble">{m.text}</div>
        <div className="msg-meta">
          {alice && <Avatar participant={alice} size={24} />}
          <span className="mono muted">{m.ts}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="msg msg-agent">
      <div className="msg-avatar">
        <div className="agent-avatar">
          <Icon name="sparkles" size={14} />
        </div>
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <strong>ScrumAgent</strong>{" "}
          <span className="mono muted">· orchestrator · {m.ts}</span>
        </div>
        {m.actions && m.actions.length > 0 && (
          <div className="agent-actions">
            {m.actions.map((a, i) => (
              <div key={i} className="agent-action">
                <Icon
                  name={a.kind === "retrieve" ? "search" : "sparkles"}
                  size={12}
                />
                <span>{a.label}</span>
                <span className="muted mono" style={{ fontSize: 11 }}>
                  {a.detail}
                </span>
              </div>
            ))}
          </div>
        )}
        {m.text && (
          <div className="msg-text">
            <StreamingText text={m.text} streaming={!m.final} />
          </div>
        )}
        {m.toolUse && (
          <ToolUseCard toolUse={m.toolUse} needsConfirm={!!m.needsConfirm} />
        )}
        {m.sources && m.sources.length > 0 && (
          <div className="sources-row">
            <span className="muted mono">sources:</span>
            {m.sources.map((s, i) => (
              <a key={i} className="source-chip" href="#">
                <Icon name={sourceIcon(s)} size={10} /> {s.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function sourceIcon(s: Source): IconName {
  if (s.type === "notion") return "notion";
  if (s.type === "meeting") return "calendar";
  return "file";
}
