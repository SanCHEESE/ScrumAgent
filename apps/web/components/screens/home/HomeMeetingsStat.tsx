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
        setStats(weeklyMeetingStats(meetings, new Date()));
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
