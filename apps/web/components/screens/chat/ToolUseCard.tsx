import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ToolUse } from "./mock-responses";

export interface ToolUseCardProps {
  toolUse: ToolUse;
  needsConfirm: boolean;
}

/**
 * Confirmation card the agent renders before invoking a side-effecting tool.
 * Args are shown as monospace key/value pairs; the footer surfaces Edit / Skip
 * / Create buttons while we are waiting for the user to approve.
 */
export function ToolUseCard({ toolUse, needsConfirm }: ToolUseCardProps): JSX.Element {
  return (
    <div className="tool-use-card">
      <div className="tool-use-header">
        <Icon name="jira" size={14} />
        <span className="mono">
          <strong>{toolUse.tool}</strong>
        </span>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 11 }}>
          waiting for confirmation
        </span>
      </div>
      <div className="tool-use-args">
        {Object.entries(toolUse.args).map(([k, v]) => (
          <div key={k} className="kv">
            <span className="mono muted">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      {needsConfirm && (
        <div className="tool-use-footer">
          <button className="btn btn-ghost btn-sm" type="button">
            Edit
          </button>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" type="button">
            Skip
          </button>
          <button className="btn btn-primary btn-sm" type="button">
            <Icon name="check" size={14} /> Create ticket
          </button>
        </div>
      )}
    </div>
  );
}
