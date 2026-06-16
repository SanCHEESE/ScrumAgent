"use client";

import { useEffect, useState, type JSX } from "react";
import { ApiError, api, type CalendarMeeting } from "@/lib/api";
import { decodeTokenEmail, getToken, isAgentPreviewEnvironment } from "@/lib/auth";
import { StatCard } from "@/components/screens/home/StatCard";

interface WeeklyMeetingStats {
  currentWeek: number;
  previousWeek: number;
}

const ZERO_STATS: WeeklyMeetingStats = {
  currentWeek: 0,
  previousWeek: 0,
};

function eventStartMs(m: CalendarMeeting): number | null {
  if (!m.start) return null;
  const d = new Date(m.start.length === 10 ? `${m.start}T00:00:00` : m.start);
  const time = d.getTime();
  return Number.isNaN(time) ? null : time;
}

function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function countMeetingsBetween(
  meetings: CalendarMeeting[],
  startMs: number,
  endMs: number,
): number {
  return meetings.filter((m) => {
    if (m.status?.toLowerCase() === "cancelled") return false;
    const start = eventStartMs(m);
    return start !== null && start >= startMs && start < endMs;
  }).length;
}

function weeklyStats(
  meetings: CalendarMeeting[],
  now: Date,
): WeeklyMeetingStats {
  const currentStart = startOfWeek(now).getTime();
  const nextStart = currentStart + 7 * 24 * 60 * 60 * 1000;
  const previousStart = currentStart - 7 * 24 * 60 * 60 * 1000;

  return {
    currentWeek: countMeetingsBetween(meetings, currentStart, nextStart),
    previousWeek: countMeetingsBetween(meetings, previousStart, currentStart),
  };
}

function formatTrend(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function HomeMeetingsStat(): JSX.Element {
  const [stats, setStats] = useState<WeeklyMeetingStats>(ZERO_STATS);

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
        setStats(weeklyStats(meetings, new Date()));
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setStats(ZERO_STATS);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <StatCard
      label="Meetings this week"
      value={stats.currentWeek}
      trend={formatTrend(stats.currentWeek - stats.previousWeek)}
      color="brand"
    />
  );
}
