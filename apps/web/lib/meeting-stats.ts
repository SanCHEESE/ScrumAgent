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

/** Keep the first occurrence of each event id (drops cross-project dupes). */
function dedupeById(meetings: CalendarMeeting[]): CalendarMeeting[] {
  const seen = new Set<string>();
  const unique: CalendarMeeting[] = [];
  for (const m of meetings) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    unique.push(m);
  }
  return unique;
}

export function weeklyMeetingStats(
  meetings: CalendarMeeting[],
  now: Date,
): WeeklyMeetingStats {
  // Derive week boundaries via calendar arithmetic, not a fixed 168h offset:
  // a local week is 167h/169h across a DST transition, so shifting the
  // timestamp by 7*24h lands an hour off the true local Monday-midnight.
  // Shifting the *date* by ±7 days and re-snapping to startOfWeek keeps every
  // boundary on a real local midnight regardless of DST.
  const currentStart = startOfWeek(now).getTime();
  const nextStart = startOfWeek(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7),
  ).getTime();
  const previousStart = startOfWeek(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7),
  ).getTime();

  // The same event can come back from multiple project agent accounts (e.g.
  // an event invited to two agents shares one event id); count it once.
  const unique = dedupeById(meetings);

  return {
    currentWeek: countMeetingsBetween(unique, currentStart, nextStart),
    previousWeek: countMeetingsBetween(unique, previousStart, currentStart),
  };
}
