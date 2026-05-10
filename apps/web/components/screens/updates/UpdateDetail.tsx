"use client";

import Link from "next/link";
import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import type { Update, UpdateStatus } from "@/lib/types";
import { DiffView } from "./DiffView";

export interface UpdateDetailProps {
  update: Update;
  /** Whether the current proposal differs from the agent's original. */
  edited: boolean;
  editNote: string;
  /** When true the After side renders the editor. */
  editing: boolean;
  draft: string;
  draftNote: string;
  onDraftChange: (next: string) => void;
  onNoteChange: (next: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRevertEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onUndoStatus: (next: UpdateStatus) => void;
}

/** Right-hand pane: diff, reasoning, confidence, action row. */
export function UpdateDetail({
  update,
  edited,
  editNote,
  editing,
  draft,
  draftNote,
  onDraftChange,
  onNoteChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRevertEdit,
  onApprove,
  onReject,
  onUndoStatus,
}: UpdateDetailProps): JSX.Element {
  const confidenceClass = `confidence confidence-${update.confidence.toLowerCase()}`;

  return (
    <div className="update-detail">
      <div className="update-detail-header">
        <div>
          <div className="hstack" style={{ gap: 10 }}>
            <span className={`update-target-chip ${update.target}`}>
              <Icon name={update.target === "jira" ? "jira" : "notion"} size={12} />
              {update.target}
            </span>
            <span
              className="mono"
              style={{ color: "var(--brand-500)", fontWeight: 600 }}
            >
              {update.objectName}
            </span>
            <StatusPill status={update.status} />
            <span className={confidenceClass}>Confidence: {update.confidence}</span>
          </div>
          <h2 className="update-detail-title">{update.updateType}</h2>
        </div>
        <div className="hstack" style={{ gap: 8 }}>
          <Link
            href={`/meetings/${update.meetingId}`}
            className="btn btn-ghost btn-sm"
          >
            Source: {update.meetingTitle} <Icon name="arrow_right" size={12} />
          </Link>
          {update.status === "pending" && !editing && (
            <Button variant="secondary" size="sm" onClick={onStartEdit}>
              <Icon name="edit" size={14} />
              {edited ? "Continue editing" : "Edit proposal"}
            </Button>
          )}
        </div>
      </div>

      <DiffView
        before={update.before}
        after={update.after}
        editing={editing}
        edited={edited}
        draft={draft}
        note={draftNote}
        onDraftChange={onDraftChange}
        onNoteChange={onNoteChange}
      />

      {edited && !editing && (
        <div className="edit-note-box">
          <Icon name="sparkles" size={12} />
          <span>
            <strong>Your edit.</strong>{" "}
            {editNote
              ? `“${editNote}”`
              : "Proposal was modified before approval."}
          </span>
          <button type="button" className="link-btn" onClick={onRevertEdit}>
            Revert to agent proposal
          </button>
        </div>
      )}

      <div className="reasoning-box">
        <div className="reasoning-label">
          <Icon name="sparkles" size={12} /> Reasoning
        </div>
        <div className="reasoning-text">{update.reasoning}</div>
      </div>

      {update.status === "pending" &&
        (editing ? (
          <div className="update-actions">
            <span
              className="muted mono"
              style={{ fontSize: 12 }}
            >
              Editing proposal — changes stay local until you approve or save.
            </span>
            <div className="spacer" />
            <Button variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onSaveEdit}>
              <Icon name="check" size={14} /> Save changes
            </Button>
          </div>
        ) : (
          <div className="update-actions">
            <Button variant="danger" onClick={onReject}>
              <Icon name="close" size={14} /> Reject
            </Button>
            <div className="spacer" />
            <Button variant="primary" onClick={onApprove}>
              <Icon name="check" size={14} />
              {edited ? "Approve edited & apply" : "Approve & apply"}
            </Button>
          </div>
        ))}

      {update.status === "approved" && (
        <div className="update-actions">
          <span className="badge badge-paid">Approved</span>
          <span className="muted">Will apply in next sync.</span>
          <div className="spacer" />
          <button
            type="button"
            className="link-btn link-btn-inline"
            onClick={() => onUndoStatus("pending")}
          >
            Undo
          </button>
        </div>
      )}

      {update.status === "rejected" && (
        <div className="update-actions">
          <span className="badge badge-neutral">Rejected</span>
          <div className="spacer" />
          <button
            type="button"
            className="link-btn link-btn-inline"
            onClick={() => onUndoStatus("pending")}
          >
            Reopen
          </button>
        </div>
      )}

      {update.status === "applied" && (
        <div className="update-actions">
          <span className="badge badge-paid">
            <Icon name="check" size={12} /> Applied to {update.target}
          </span>
        </div>
      )}
    </div>
  );
}
