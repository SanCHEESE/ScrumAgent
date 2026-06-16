"use client";

import { useMemo, type JSX } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import type { CalendarMeeting } from "@/lib/api";
import { parseCalendarDate, parseCalendarMs } from "@/lib/calendar-date";
import { useProjectMeetings } from "@/components/shell/ProjectMeetingsProvider";

interface RecentMeeting extends CalendarMeeting {
  projectName: string;
}

interface RecentMeetingsState {
  loading: boolean;
  meetings: RecentMeeting[];
  error: string | null;
  noProjects: boolean;
  /**
   * True when meetings.length === 0 because every project that failed did so
   * with a 409 ("no Google calendar connected") — a soft, actionable state
   * distinct from a hard fetch failure. Ignored when there are meetings to show.
   */
  needsCalendar: boolean;
}

const EMPTY_RECENT_MEETINGS: RecentMeetingsState = {
  loading: true,
  meetings: [],
  error: null,
  noProjects: false,
  needsCalendar: false,
};

function eventStartMs(m: CalendarMeeting): number {
  return parseCalendarMs(m.start) ?? 0;
}

function eventEndMs(m: CalendarMeeting): number {
  return parseCalendarMs(m.end) ?? 0;
}

function eventDate(m: CalendarMeeting): Date | null {
  return parseCalendarDate(m.start);
}

function formatDay(m: CalendarMeeting): string {
  const d = eventDate(m);
  return d ? d.getDate().toString().padStart(2, "0") : "--";
}

function formatMonth(m: CalendarMeeting): string {
  const d = eventDate(m);
  return d
    ? d.toLocaleString(undefined, { month: "short" }).toUpperCase()
    : "---";
}

function formatDuration(m: CalendarMeeting): string {
  if (m.all_day) return "All day";
  if (!m.start || !m.end) return "Calendar event";
  const minutes = Math.max(
    1,
    Math.round((eventEndMs(m) - eventStartMs(m)) / 60_000),
  );
  if (!Number.isFinite(minutes)) return "Calendar event";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function eventStatus(m: CalendarMeeting): string {
  return eventStartMs(m) >= Date.now() ? "scheduled" : "past";
}

function attendeeSummary(m: CalendarMeeting): string {
  const count = m.attendees.length;
  if (count === 0) return "No attendees";
  if (count === 1) return "1 attendee";
  return `${count} attendees`;
}

function RecentMeetingRow({
  meeting,
  onClick,
}: {
  meeting: RecentMeeting;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="meeting-compact"
      onClick={onClick}
      aria-label={`Open ${meeting.title ?? "meeting"} in Google Calendar`}
    >
      <div className="meeting-compact-date">
        <div className="meeting-compact-day">{formatDay(meeting)}</div>
        <div className="meeting-compact-month">{formatMonth(meeting)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div className="meeting-compact-title">
          {meeting.title ?? "Untitled meeting"}
        </div>
        <div className="meeting-compact-meta">
          <span>{attendeeSummary(meeting)}</span>
          <span className="muted mono">{formatDuration(meeting)}</span>
          <span className="muted">{meeting.projectName}</span>
        </div>
      </div>
      <StatusPill status={eventStatus(meeting)} />
    </button>
  );
}

function RecentMeetingsList({
  state,
  onMeetingClick,
}: {
  state: RecentMeetingsState;
  onMeetingClick: (meeting: RecentMeeting) => void;
}): JSX.Element {
  if (state.loading) {
    return (
      <div className="empty">
        <div className="empty-title">Loading calendar...</div>
        <div className="empty-sub">Fetching recent Google Calendar events.</div>
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="project-error" role="alert">
        <Icon name="alert" size={12} />
        {state.error}
      </div>
    );
  }
  if (state.noProjects) {
    return (
      <div className="empty">
        <div className="empty-title">No projects yet</div>
        <div className="empty-sub">
          Create a project to show calendar meetings.
        </div>
      </div>
    );
  }
  if (state.meetings.length === 0 && state.needsCalendar) {
    return (
      <div className="empty">
        <div className="empty-title">Connect Google Calendar</div>
        <div className="empty-sub">
          Link a Google Calendar to your project to show upcoming meetings.
        </div>
      </div>
    );
  }
  if (state.meetings.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">No calendar meetings found</div>
        <div className="empty-sub">Recent events will appear after Calendar syncs.</div>
      </div>
    );
  }
  return (
    <div className="meeting-compact-list">
      {state.meetings.map((m) => (
        <RecentMeetingRow
          key={m.id}
          meeting={m}
          onClick={() => onMeetingClick(m)}
        />
      ))}
    </div>
  );
}

export function RecentMeetingsLive(): JSX.Element {
  const router = useRouter();
  const { meetings, failures, loading, noProjects, projectsError } =
    useProjectMeetings();

  const state = useMemo<RecentMeetingsState>(() => {
    if (loading) return { ...EMPTY_RECENT_MEETINGS, loading: true };
    if (projectsError) {
      return {
        ...EMPTY_RECENT_MEETINGS,
        loading: false,
        error: "Could not load projects.",
      };
    }
    if (noProjects) {
      return { ...EMPTY_RECENT_MEETINGS, loading: false, noProjects: true };
    }

    // The provider already deduped by id and dropped cancelled events; here we
    // keep just the soonest three still-upcoming meetings.
    const now = Date.now();
    const recent = meetings
      .filter((m) => eventStartMs(m) >= now)
      .sort((a, b) => eventStartMs(a) - eventStartMs(b))
      .slice(0, 3);

    // A 409 means that project has no Google calendar connected (soft /
    // actionable); any other per-project failure is a hard error. With rows to
    // show, never replace the populated list with either state.
    const hardFailures = failures.filter((f) => f.status !== 409).length;
    const notConnected = failures.filter((f) => f.status === 409).length;

    return {
      loading: false,
      meetings: recent,
      error:
        recent.length === 0 && hardFailures > 0
          ? "Could not load Google Calendar meetings."
          : null,
      noProjects: false,
      needsCalendar:
        recent.length === 0 && hardFailures === 0 && notConnected > 0,
    };
  }, [meetings, failures, loading, noProjects, projectsError]);

  function openMeeting(m: RecentMeeting): void {
    if (m.html_link) {
      window.open(m.html_link, "_blank", "noopener,noreferrer");
      return;
    }
    router.push("/meetings");
  }

  return <RecentMeetingsList state={state} onMeetingClick={openMeeting} />;
}
