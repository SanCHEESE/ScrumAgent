"use client";

import type { JSX } from "react";

export interface EditProposalProps {
  draft: string;
  note: string;
  onDraftChange: (next: string) => void;
  onNoteChange: (next: string) => void;
}

/**
 * Inline editor that replaces the static After value when the user is editing
 * the agent's proposal. Auto-grows with the line count to stay close to the
 * prototype behaviour.
 */
export function EditProposal({
  draft,
  note,
  onDraftChange,
  onNoteChange,
}: EditProposalProps): JSX.Element {
  const rows = Math.max(4, draft.split("\n").length + 1);
  return (
    <>
      <textarea
        className="diff-editor"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        rows={rows}
        aria-label="Edited proposal"
        autoFocus
      />
      <input
        className="diff-editor-note"
        type="text"
        placeholder="Why are you editing? (optional, added to agent reasoning)"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        aria-label="Edit note"
      />
    </>
  );
}
