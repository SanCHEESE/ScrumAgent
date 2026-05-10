import type { JSX } from "react";
import { AvatarStack } from "@/components/ui/AvatarStack";
import { StatusPill } from "@/components/ui/StatusPill";
import type { Meeting } from "@/lib/types";

export interface MeetingRowCompactProps {
  meeting: Meeting;
  onClick?: () => void;
}

/**
 * Compact meeting list row used on the Home dashboard.
 * Matches `.meeting-compact` from kabanchik-screens.css.
 */
export function MeetingRowCompact({
  meeting,
  onClick,
}: MeetingRowCompactProps): JSX.Element {
  const day = meeting.date.slice(-2);
  return (
    <div className="meeting-compact" onClick={onClick}>
      <div className="meeting-compact-date">
        <div className="meeting-compact-day">{day}</div>
        <div className="meeting-compact-month">MAR</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="meeting-compact-title">{meeting.title}</div>
        <div className="meeting-compact-meta">
          <AvatarStack ids={meeting.participants} max={4} />
          <span className="muted mono">{meeting.duration}</span>
        </div>
      </div>
      <StatusPill status={meeting.status} />
    </div>
  );
}
