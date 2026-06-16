"use client";

import { useEffect, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ApiError, api, type CalendarMeeting } from "@/lib/api";
import { decodeTokenEmail, getToken } from "@/lib/auth";

interface RecentMeeting extends CalendarMeeting {
  projectName: string;
}

interface RecentMeetingsState {
  loading: boolean;
  meetings: RecentMeeting[];
  error: string | null;
  noProjects: boolean;
}

const EMPTY_RECENT_MEETINGS: RecentMeetingsState = {
  loading: true,
  meetings: [],
  error: null,
  noProjects: false,
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
          key={`${m.projectName}-${m.id}`}
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
        if (!token || !decodeTokenEmail(token)) {
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

        const meetings = results
          .filter(
            (r): r is PromiseFulfilledResult<RecentMeeting[]> =>
              r.status === "fulfilled",
          )
          .flatMap((r) => r.value)
          .sort((a, b) => eventStartMs(b) - eventStartMs(a))
          .slice(0, 3);

        const problems = results.filter((r) => r.status === "rejected").length;
        setState({
          loading: false,
          meetings,
          error:
            meetings.length === 0 && problems > 0
              ? "Could not load Google Calendar meetings."
              : null,
          noProjects: false,
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
