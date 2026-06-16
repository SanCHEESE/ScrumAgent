"use client";

import { useMemo, type JSX } from "react";
import { weeklyMeetingStats } from "@/lib/meeting-stats";
import { StatCard } from "@/components/screens/home/StatCard";
import { useProjectMeetings } from "@/components/shell/ProjectMeetingsProvider";

function formatTrend(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

/**
 * "Meetings this week" stat — current-week count (vs. last week) from the shared
 * per-project calendar fan-out (ScrumAgent-iar). When some project calendars
 * fail to load, the count is incomplete; we mark it without disturbing the
 * happy-path DOM. A 409 ("no calendar connected") is not a failure — that
 * project simply has no meetings — so only hard failures flag the count.
 */
export function HomeMeetingsStat(): JSX.Element {
  const { meetings, failures, total } = useProjectMeetings();

  const stats = useMemo(
    () => weeklyMeetingStats(meetings, new Date()),
    [meetings],
  );

  const hardFailed = failures.filter((f) => f.status !== 409).length;
  const partial = hardFailed > 0;
  const allFailed = total > 0 && hardFailed === total;
  const partialNote = allFailed
    ? "Couldn't load meetings — count unavailable"
    : `${hardFailed} of ${total} calendars failed to load — count may be incomplete`;

  const label = partial ? (
    <>
      Meetings this week{" "}
      <span
        className="stat-partial-marker"
        role="img"
        title={partialNote}
        aria-label={partialNote}
        style={{ opacity: 0.7, fontWeight: 700 }}
      >
        *
      </span>
    </>
  ) : (
    "Meetings this week"
  );

  // If every calendar failed, a confident "0" would be a lie — show unknown.
  const value = allFailed ? "—" : stats.currentWeek;

  return (
    <StatCard
      label={label}
      value={value}
      trend={formatTrend(stats.currentWeek - stats.previousWeek)}
      color="brand"
    />
  );
}
