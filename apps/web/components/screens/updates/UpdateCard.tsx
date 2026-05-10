"use client";

import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Update } from "@/lib/types";

export interface UpdateCardProps {
  update: Update;
  active: boolean;
  edited: boolean;
  onSelect: () => void;
}

/**
 * Single row in the left-hand updates list. Renders the target chip + object,
 * update type, source meeting and a "edited by you" tag when locally modified.
 */
export function UpdateCard({ update, active, edited, onSelect }: UpdateCardProps): JSX.Element {
  const confidenceClass = `confidence confidence-${update.confidence.toLowerCase()}`;
  return (
    <button
      type="button"
      className={`update-card${active ? " active" : ""}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <div className="update-card-top">
        <span className={`update-target-chip ${update.target}`}>
          <Icon name={update.target === "jira" ? "jira" : "notion"} size={12} />
          {update.target}
        </span>
        <span className={confidenceClass}>{update.confidence}</span>
      </div>
      <div className="update-card-object mono">{update.objectName}</div>
      <div className="update-card-type">{update.updateType}</div>
      <div className="update-card-source muted">
        from <strong>{update.meetingTitle}</strong>
      </div>
      {edited && (
        <div className="update-card-edited">
          <Icon name="sparkles" size={10} /> edited by you
        </div>
      )}
    </button>
  );
}
