"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { MeetingRow } from "@/components/screens/meetings/MeetingRow";
import { MEETINGS } from "@/lib/mock-data";
import type { MeetingStatus } from "@/lib/types";

type Filter = "all" | MeetingStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
  { key: "analyzing", label: "Analyzing" },
  { key: "transcribing", label: "Transcribing" },
  { key: "error", label: "Error" },
];

export default function MeetingsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...MEETINGS].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((m) => {
      if (filter !== "all" && m.status !== filter) return false;
      if (q && !m.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, filter, query]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = {
      all: sorted.length,
      done: 0,
      analyzing: 0,
      transcribing: 0,
      error: 0,
    };
    for (const m of sorted) out[m.status] += 1;
    return out;
  }, [sorted]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Meetings <em>archive</em>
          </h1>
          <div className="page-subtitle">
            Every meeting ScrumAgent has joined or analyzed.
          </div>
        </div>
        <div className="hstack">
          <label className="input-search">
            <Icon name="search" size={14} />
            <input
              className="input-bare"
              placeholder="Search meetings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Button variant="secondary" size="sm">
            <Icon name="plus" size={14} /> Upload recording
          </Button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`tab ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="tab-count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="meetings-table">
        <div className="meetings-table-head" role="row">
          <div>Meeting</div>
          <div>Date</div>
          <div>Participants</div>
          <div>Outputs</div>
          <div>Status</div>
          <div></div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No meetings match</div>
            <div className="empty-sub">
              Try a different search or clear the filter.
            </div>
          </div>
        ) : (
          filtered.map((m) => <MeetingRow key={m.id} meeting={m} />)
        )}
      </div>
    </div>
  );
}
