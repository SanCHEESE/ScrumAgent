// Shared parser for Google Calendar event timestamps (ScrumAgent-7xk).
//
// A calendar start/end is either an RFC 3339 dateTime (e.g.
// "2026-06-16T10:00:00Z") or, for an all-day event, a bare "YYYY-MM-DD" date
// with no time or zone. Comparing/sorting the two requires pinning the all-day
// form to local midnight first — an idiom that was hand-rolled (with divergent
// null/NaN handling) across RecentMeetingsLive, meeting-stats, the meetings
// page, ProjectsListLive, and CalendarMeetingRow. This is the single
// implementation; a timezone/all-day fix now lives in one place.

/** A calendar timestamp: an RFC 3339 dateTime, a "YYYY-MM-DD" all-day date, or
 *  null/undefined when the event has no such bound. */
export type CalendarDateInput = string | null | undefined;

/**
 * Parse a calendar start/end to a `Date`, pinning all-day ("YYYY-MM-DD") values
 * to local midnight. Returns `null` for an absent or unparseable value — every
 * call site shares this null handling instead of each picking 0 / NaN / null.
 */
export function parseCalendarDate(value: CalendarDateInput): Date | null {
  if (!value) return null;
  const iso = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Epoch milliseconds for a calendar start/end, or `null` when absent/invalid. */
export function parseCalendarMs(value: CalendarDateInput): number | null {
  return parseCalendarDate(value)?.getTime() ?? null;
}
