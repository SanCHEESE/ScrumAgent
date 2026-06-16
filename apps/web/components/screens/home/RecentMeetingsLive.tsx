"use client";

import { useEffect, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ApiError, api, type CalendarMeeting } from "@/lib/api";
import { decodeTokenEmail, getToken, isAgentPreviewEnvironment } from "@/lib/auth";

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
  if (!m.start) return 0;
  return new Date(
    m.start.length === 10 ? `${m.start}T00:00:00` : m.start,
  ).getTime();
}

function eventEndMs(m: CalendarMeeting): number {
  if (!m.end) return 0;
  return new Date(m.end.length === 10 ? `${m.end}T00:00:00` : m.end).getTime();
}

function eventDate(m: CalendarMeeting): Date | null {
  if (!m.start) return null;
  const d = new Date(m.start.length === 10 ? `${m.start}T00:00:00` : m.start);
  return Number.isNaN(d.getTime()) ? null : d;
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
  const [state, setState] =
    useState<RecentMeetingsState>(EMPTY_RECENT_MEETINGS);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = getToken();
        if (
          !isAgentPreviewEnvironment() &&
          (!token || !decodeTokenEmail(token))
        ) {
          setState({ ...EMPTY_RECENT_MEETINGS, loading: false });
          return;
        }

        const projects = await api.listProjects();
        if (!active) return;
        if (projects.length === 0) {
          setState({
            ...EMPTY_RECENT_MEETINGS,
            loading: false,
            noProjects: true,
          });
          return;
        }

        const results = await Promise.allSettled(
          projects.map(async (p) => {
            const events = await api.listProjectMeetings(p.id);
            return events.map<RecentMeeting>((e) => ({
              ...e,
              projectName: p.name,
            }));
          }),
        );
        if (!active) return;

        const now = Date.now();
        const fulfilled = results
          .filter(
            (r): r is PromiseFulfilledResult<RecentMeeting[]> =>
              r.status === "fulfilled",
          )
          .flatMap((r) => r.value);

        // De-duplicate by event id (keep first) so a shared event across two
        // projects yields a single row, then drop cancelled events (mirrors the
        // stats helper) and anything that has already started.
        const seen = new Set<string>();
        const meetings = fulfilled
          .filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          })
          .filter((m) => m.status?.toLowerCase() !== "cancelled")
          .filter((m) => eventStartMs(m) >= now)
          .sort((a, b) => eventStartMs(a) - eventStartMs(b))
          .slice(0, 3);

        // Classify rejected per-project fetches. A 409 means that project has no
        // Google calendar connected (soft / actionable); any other rejection is
        // a hard failure worth surfacing as a red error.
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        const hardFailures = rejected.filter(
          (r) => !(r.reason instanceof ApiError && r.reason.status === 409),
        ).length;
        const notConnected = rejected.length - hardFailures;

        // With meetings to show, never replace the populated list with an
        // error. With none, prefer the hard-error alert, then the
        // needs-connection empty state, then the generic empty state.
        setState({
          loading: false,
          meetings,
          error:
            meetings.length === 0 && hardFailures > 0
              ? "Could not load Google Calendar meetings."
              : null,
          noProjects: false,
          needsCalendar:
            meetings.length === 0 && hardFailures === 0 && notConnected > 0,
        });
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setState({
          ...EMPTY_RECENT_MEETINGS,
          loading: false,
          error: e instanceof ApiError ? e.message : "Could not load projects.",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function openMeeting(m: RecentMeeting): void {
    if (m.html_link) {
      window.open(m.html_link, "_blank", "noopener,noreferrer");
      return;
    }
    router.push("/meetings");
  }

  return <RecentMeetingsList state={state} onMeetingClick={openMeeting} />;
}
