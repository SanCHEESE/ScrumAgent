"use client";

import { useEffect, useState, type JSX } from "react";
import { ApiError, api, type CalendarMeeting } from "@/lib/api";
import { decodeTokenEmail, getToken, isAgentPreviewEnvironment } from "@/lib/auth";
import { weeklyMeetingStats, type WeeklyMeetingStats } from "@/lib/meeting-stats";
import { StatCard } from "@/components/screens/home/StatCard";

const ZERO_STATS: WeeklyMeetingStats = {
  currentWeek: 0,
  previousWeek: 0,
};

/** How many projects' calendars we tried vs. how many failed to load. */
interface LoadHealth {
  total: number;
  failed: number;
}

const HEALTHY: LoadHealth = { total: 0, failed: 0 };

function formatTrend(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function HomeMeetingsStat(): JSX.Element {
  const [stats, setStats] = useState<WeeklyMeetingStats>(ZERO_STATS);
  const [health, setHealth] = useState<LoadHealth>(HEALTHY);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = getToken();
        if (
          !isAgentPreviewEnvironment() &&
          (!token || !decodeTokenEmail(token))
        ) {
          return;
        }

        const projects = await api.listProjects();
        if (!active || projects.length === 0) return;

        const results = await Promise.allSettled(
          projects.map((p) => api.listProjectMeetings(p.id)),
        );
        if (!active) return;

        const meetings = results
          .filter(
            (r): r is PromiseFulfilledResult<CalendarMeeting[]> =>
              r.status === "fulfilled",
          )
          .flatMap((r) => r.value);
        const failed = results.filter((r) => r.status === "rejected").length;
        setHealth({ total: results.length, failed });
        setStats(weeklyMeetingStats(meetings, new Date()));
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setHealth(HEALTHY);
        setStats(ZERO_STATS);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Some projects' calendars failed to load: the count is incomplete. Surface
  // that without disturbing the happy-path DOM — at zero failures the label is
  // the bare string and the value is the number, exactly as before.
  const partial = health.failed > 0;
  const allFailed = health.total > 0 && health.failed === health.total;
  const partialNote = allFailed
    ? "Couldn't load meetings — count unavailable"
    : `${health.failed} of ${health.total} calendars failed to load — count may be incomplete`;

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
