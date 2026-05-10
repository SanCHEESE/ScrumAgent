import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Update } from "@/lib/types";

export interface UpdateRowCompactProps {
  update: Update;
  onClick?: () => void;
}

/**
 * Compact pending-update row used on the Home dashboard.
 * Matches `.update-compact` + `.confidence-*` from kabanchik-screens.css.
 */
export function UpdateRowCompact({
  update,
  onClick,
}: UpdateRowCompactProps): JSX.Element {
  const confidenceCls = `confidence confidence-${update.confidence.toLowerCase()}`;
  const reason =
    update.reasoning.length > 80
      ? `${update.reasoning.slice(0, 80)}…`
      : update.reasoning;
  return (
    <div className="update-compact" onClick={onClick}>
      <div className={`update-compact-icon ${update.target}`}>
        <Icon name={update.target === "jira" ? "jira" : "notion"} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="update-compact-line">
          <span className="mono" style={{ color: "var(--brand-500)" }}>
            {update.objectName}
          </span>
          <span className="muted"> · {update.updateType}</span>
        </div>
        <div className="update-compact-reason">{reason}</div>
      </div>
      <div className={confidenceCls}>{update.confidence}</div>
    </div>
  );
}
