"use client";

import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import { EditProposal } from "./EditProposal";

export interface DiffViewProps {
  before: string;
  after: string;
  /** True when the After side renders the editor instead of the static value. */
  editing: boolean;
  /** Whether the "After" value differs from the agent proposal. */
  edited: boolean;
  /** Editor draft (only used when editing). */
  draft: string;
  /** Editor optional-note draft. */
  note: string;
  onDraftChange: (next: string) => void;
  onNoteChange: (next: string) => void;
}

/** Two-column Before / After diff with optional inline editor on the After side. */
export function DiffView({
  before,
  after,
  editing,
  edited,
  draft,
  note,
  onDraftChange,
  onNoteChange,
}: DiffViewProps): JSX.Element {
  const afterClasses = ["diff-side", "diff-after", editing ? "is-editing" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="update-diff">
      <div className="diff-side diff-before">
        <div className="diff-label">Before</div>
        <div className="diff-content">
          {before === "" ? <span className="muted">— empty —</span> : before}
        </div>
      </div>
      <div className="diff-arrow" aria-hidden>
        <Icon name="arrow_right" size={18} />
      </div>
      <div className={afterClasses}>
        <div className="diff-label">
          After
          {editing ? (
            <span className="badge-warn" style={{ marginLeft: 8 }}>
              editing
            </span>
          ) : edited ? (
            <span className="badge badge-brand" style={{ marginLeft: 8 }}>
              edited by you
            </span>
          ) : (
            <span className="badge badge-brand" style={{ marginLeft: 8 }}>
              proposed
            </span>
          )}
        </div>
        {editing ? (
          <EditProposal
            draft={draft}
            note={note}
            onDraftChange={onDraftChange}
            onNoteChange={onNoteChange}
          />
        ) : (
          <div className="diff-content">{after}</div>
        )}
      </div>
    </div>
  );
}
