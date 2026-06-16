import type { CalendarMeeting } from "./api";

export interface WeeklyMeetingStats {
  currentWeek: number;
  previousWeek: number;
}

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

export function weeklyMeetingStats(
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
