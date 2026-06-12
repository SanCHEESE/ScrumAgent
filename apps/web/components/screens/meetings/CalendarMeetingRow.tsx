import type { JSX } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import type { CalendarMeeting } from "@/lib/api";
import type { Participant } from "@/lib/types";

export interface CalendarMeetingVM extends CalendarMeeting {
  projectName: string;
  projectColor: string;
  upcoming: boolean;
}

export interface CalendarMeetingRowProps {
  meeting: CalendarMeetingVM;
}

const AVATAR_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

function attendeeParticipant(
  email: string | null,
  displayName: string | null,
): Participant {
  const name = displayName ?? email ?? "?";
  const source = email ?? name;
  const words = name.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  const initials = (
    words.length >= 2
      ? words[0][0] + words[words.length - 1][0]
      : name.slice(0, 2)
  ).toUpperCase();
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0;
  }
  return {
    name,
    initials,
    color: AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length],
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function formatTime(m: CalendarMeetingVM): string {
  if (m.all_day) return "All day";
  if (!m.start) return "";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return m.end ? `${fmt(m.start)}–${fmt(m.end)}` : fmt(m.start);
}

function formatDuration(m: CalendarMeetingVM): string {
  if (m.all_day) return "All day";
  if (!m.start || !m.end) return "";
  const mins = Math.round(
    (new Date(m.end).getTime() - new Date(m.start).getTime()) / 60000,
  );
  if (mins <= 0) return "";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** One row for a live Google Calendar event. Click opens it in Google Calendar. */
export function CalendarMeetingRow({
  meeting: m,
}: CalendarMeetingRowProps): JSX.Element {
  const attendees = m.attendees.length
    ? m.attendees
    : m.organizer_email
      ? [
          {
            email: m.organizer_email,
            display_name: null,
            response_status: null,
            organizer: true,
          },
        ]
      : [];
  const shown = attendees.slice(0, 5);
  const extra = attendees.length - shown.length;
  const duration = formatDuration(m);

  const inner = (
    <>
      <div>
        <div className="mtr-title">{m.title ?? "(no title)"}</div>
        <div className="mtr-sub mono muted">
          {duration ? `${duration} · ` : ""}
          {m.projectName}
        </div>
      </div>
      <div className="mono">
        {formatDate(m.start)}
        <br />
        <span className="muted">{formatTime(m)}</span>
      </div>
      <div>
        <div className="avatar-stack">
          {shown.map((a, i) => (
            <Avatar
              key={a.email ?? i}
              participant={attendeeParticipant(a.email, a.display_name)}
              size={26}
            />
          ))}
          {extra > 0 && (
            <div
              className="avatar"
              style={{
                background: "var(--bg-2)",
                color: "var(--ink-2)",
                width: 26,
                height: 26,
                fontSize: 10,
              }}
            >
              +{extra}
            </div>
          )}
        </div>
      </div>
      <div>
        {m.meet_link ? (
          <span className="mtr-output">
            <Icon name="mic" size={12} /> Meet
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div>
        <StatusPill status={m.upcoming ? "scheduled" : "past"} />
      </div>
      <div>
        <Icon name="chevron_right" size={16} />
      </div>
    </>
  );

  if (m.html_link) {
    return (
      <a
        className="meetings-table-row"
        href={m.html_link}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${m.title ?? "meeting"} in Google Calendar`}
      >
        {inner}
      </a>
    );
  }
  return <div className="meetings-table-row">{inner}</div>;
}
