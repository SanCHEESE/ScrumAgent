import { useState } from "react";
import type { JSX } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { PARTICIPANTS } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { useActiveProject } from "@/components/shell/ActiveProjectProvider";
import type { Message, Source } from "./mock-responses";
import { StreamingText } from "./StreamingText";
import { ToolUseCard } from "./ToolUseCard";

export interface ChatMessageProps {
  message: Message;
}

type RememberState = "idle" | "saving" | "saved";

/**
 * Renders a single user or agent message. Agent messages compose the action
 * trace, streaming text body, optional tool-use card, source chips, and a
 * Remember button (final messages with a persisted dbId only).
 */
export function ChatMessage({ message: m }: ChatMessageProps): JSX.Element {
  const { activeProject } = useActiveProject();
  const [rememberState, setRememberState] = useState<RememberState>("idle");

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

  const canRemember =
    m.final && m.dbId != null && activeProject.id !== "__no-project__";

  const handleRemember = async (): Promise<void> => {
    if (!canRemember || rememberState === "saving") return;
    setRememberState("saving");
    try {
      await api.remember(activeProject.id, m.dbId as number);
      setRememberState("saved");
    } catch {
      // On error reset to idle so the user can retry
      setRememberState("idle");
    }
  };

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
        {canRemember && (
          <div className="msg-actions">
            {rememberState === "saved" ? (
              <span className="mono muted" style={{ fontSize: 11 }}>
                <Icon name="check" size={11} /> Saved to knowledge base
              </span>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => void handleRemember()}
                disabled={rememberState === "saving"}
                type="button"
                title="Save this response to the knowledge base"
              >
                <Icon name="brain" size={12} />
                {rememberState === "saving" ? "Saving…" : "Remember"}
              </button>
            )}
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
