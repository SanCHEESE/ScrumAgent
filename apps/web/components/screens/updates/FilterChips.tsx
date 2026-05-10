"use client";

import type { JSX } from "react";
import type { UpdateStatus } from "@/lib/types";

export type UpdatesFilter = UpdateStatus | "all";

interface ChipDef {
  key: UpdatesFilter;
  label: string;
}

const CHIPS: ChipDef[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "applied", label: "Applied" },
];

export interface FilterChipsProps {
  active: UpdatesFilter;
  counts: Record<UpdatesFilter, number>;
  onChange: (next: UpdatesFilter) => void;
}

/** Tabbed filter strip rendered above the updates list. */
export function FilterChips({ active, counts, onChange }: FilterChipsProps): JSX.Element {
  return (
    <div className="tabs" role="tablist">
      {CHIPS.map((c) => {
        const isActive = active === c.key;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tab${isActive ? " active" : ""}`}
            onClick={() => onChange(c.key)}
          >
            {c.label}
            <span className="tab-count">{counts[c.key]}</span>
          </button>
        );
      })}
    </div>
  );
}
