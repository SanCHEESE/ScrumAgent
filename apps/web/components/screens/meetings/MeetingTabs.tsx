"use client";

import type { JSX } from "react";

export type MeetingTabKey =
  | "summary"
  | "transcript"
  | "actions"
  | "decisions"
  | "outputs";

export interface MeetingTab {
  key: MeetingTabKey;
  label: string;
  count?: number;
}

export interface MeetingTabsProps {
  tabs: MeetingTab[];
  active: MeetingTabKey;
  onChange: (key: MeetingTabKey) => void;
}

/** Tab strip used in the meeting detail screen. */
export function MeetingTabs({
  tabs,
  active,
  onChange,
}: MeetingTabsProps): JSX.Element {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`tab ${active === t.key ? "active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="tab-count">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
