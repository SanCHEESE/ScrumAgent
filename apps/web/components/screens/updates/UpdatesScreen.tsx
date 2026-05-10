"use client";

import { useMemo, useState } from "react";
import type { JSX } from "react";
import { Card } from "@/components/ui/Card";
import { UPDATES } from "@/lib/mock-data";
import type { Update, UpdateStatus } from "@/lib/types";
import { FilterChips, type UpdatesFilter } from "./FilterChips";
import { UpdateCard } from "./UpdateCard";
import { UpdateDetail } from "./UpdateDetail";

interface LocalUpdate extends Update {
  /** Original "After" value as proposed by the agent (so we can revert). */
  agentAfter: string;
  /** True when the local After value differs from `agentAfter`. */
  edited: boolean;
  /** Optional reason note attached when the user edited the proposal. */
  editNote: string;
}

function withDefaults(u: Update): LocalUpdate {
  return { ...u, agentAfter: u.after, edited: false, editNote: "" };
}

function pickInitialId(items: LocalUpdate[]): string | null {
  const pending = items.find((u) => u.status === "pending");
  if (pending) return pending.id;
  return items[0]?.id ?? null;
}

/** Top-level Updates split-pane view (filter chips + list + detail). */
export function UpdatesScreen(): JSX.Element {
  const [items, setItems] = useState<LocalUpdate[]>(() => UPDATES.map(withDefaults));
  const [filter, setFilter] = useState<UpdatesFilter>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    pickInitialId(UPDATES.map(withDefaults)),
  );

  // Editor state — scoped to the currently selected update.
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>("");
  const [draftNote, setDraftNote] = useState<string>("");

  const counts = useMemo<Record<UpdatesFilter, number>>(() => {
    const base: Record<UpdatesFilter, number> = {
      all: items.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      applied: 0,
    };
    for (const u of items) base[u.status] += 1;
    return base;
  }, [items]);

  const filtered = useMemo<LocalUpdate[]>(
    () => (filter === "all" ? items : items.filter((u) => u.status === filter)),
    [items, filter],
  );

  const current: LocalUpdate | null = useMemo(() => {
    if (selectedId) {
      const fromFilter = filtered.find((u) => u.id === selectedId);
      if (fromFilter) return fromFilter;
      const fromAll = items.find((u) => u.id === selectedId);
      if (fromAll) return fromAll;
    }
    return filtered[0] ?? null;
  }, [filtered, items, selectedId]);

  const handleFilterChange = (next: UpdatesFilter): void => {
    setFilter(next);
    setEditing(false);
    const pool = next === "all" ? items : items.filter((u) => u.status === next);
    setSelectedId(pool[0]?.id ?? null);
  };

  const handleSelect = (id: string): void => {
    setSelectedId(id);
    setEditing(false);
    setDraft("");
    setDraftNote("");
  };

  const handleStartEdit = (): void => {
    if (!current) return;
    setDraft(current.after);
    setDraftNote(current.editNote);
    setEditing(true);
  };

  const handleCancelEdit = (): void => {
    setEditing(false);
    setDraft("");
    setDraftNote("");
  };

  const handleSaveEdit = (): void => {
    if (!current) return;
    const id = current.id;
    setItems((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              after: draft,
              editNote: draftNote,
              edited: draft !== u.agentAfter,
            }
          : u,
      ),
    );
    setEditing(false);
  };

  const handleRevertEdit = (): void => {
    if (!current) return;
    const id = current.id;
    setItems((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, after: u.agentAfter, edited: false, editNote: "" }
          : u,
      ),
    );
    setEditing(false);
    setDraft("");
    setDraftNote("");
  };

  const updateStatus = (id: string, status: UpdateStatus): void => {
    setItems((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
  };

  const handleApprove = (): void => {
    if (!current) return;
    updateStatus(current.id, "approved");
    setEditing(false);
  };

  const handleReject = (): void => {
    if (!current) return;
    updateStatus(current.id, "rejected");
    setEditing(false);
  };

  const handleUndoStatus = (next: UpdateStatus): void => {
    if (!current) return;
    updateStatus(current.id, next);
    setEditing(false);
  };

  return (
    <div className="page wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Proposed <em>updates</em>
          </h1>
          <div className="page-subtitle">
            Review changes ScrumAgent wants to make to Jira and Notion. Approve,
            edit, or reject.
          </div>
        </div>
      </div>

      <FilterChips active={filter} counts={counts} onChange={handleFilterChange} />

      {filtered.length === 0 || !current ? (
        <Card className="empty">
          <div className="empty-title">Nothing here.</div>
          <div className="empty-sub">No updates in this tab.</div>
        </Card>
      ) : (
        <div className="updates-split">
          <div className="updates-list">
            {filtered.map((u) => (
              <UpdateCard
                key={u.id}
                update={u}
                active={current.id === u.id}
                edited={u.edited}
                onSelect={() => handleSelect(u.id)}
              />
            ))}
          </div>
          <UpdateDetail
            update={current}
            edited={current.edited}
            editNote={current.editNote}
            editing={editing}
            draft={draft}
            draftNote={draftNote}
            onDraftChange={setDraft}
            onNoteChange={setDraftNote}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleSaveEdit}
            onRevertEdit={handleRevertEdit}
            onApprove={handleApprove}
            onReject={handleReject}
            onUndoStatus={handleUndoStatus}
          />
        </div>
      )}
    </div>
  );
}
