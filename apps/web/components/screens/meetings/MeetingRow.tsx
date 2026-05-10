import type { JSX } from "react";
import Link from "next/link";
import { AvatarStack } from "@/components/ui/AvatarStack";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import type { Meeting } from "@/lib/types";

export interface MeetingRowProps {
  meeting: Meeting;
}

/** One row in the meetings table. Click navigates to detail. */
export function MeetingRow({ meeting }: MeetingRowProps): JSX.Element {
  const m = meeting;
  return (
    <Link
      className="meetings-table-row"
      href={`/meetings/${m.id}`}
      aria-label={`Open meeting ${m.title}`}
    >
      <div>
        <div className="mtr-title">{m.title}</div>
        <div className="mtr-sub mono muted">
          {m.duration} · {m.id}
        </div>
      </div>
      <div className="mono">
        {m.date}
        <br />
        <span className="muted">{m.time}</span>
      </div>
      <div>
        <AvatarStack ids={m.participants} max={5} />
      </div>
      <div>
        {m.status === "done" ? (
          <div className="mtr-outputs">
            {m.jiraIssues.length > 0 && (
              <span className="mtr-output">
                <Icon name="jira" size={12} /> {m.jiraIssues.length}
              </span>
            )}
            {m.notionPages.length > 0 && (
              <span className="mtr-output">
                <Icon name="notion" size={12} /> {m.notionPages.length}
              </span>
            )}
            {m.actionItems.length > 0 && (
              <span className="mtr-output">
                <Icon name="check" size={12} /> {m.actionItems.length}
              </span>
            )}
          </div>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div>
        <StatusPill status={m.status} />
      </div>
      <div>
        <Icon name="chevron_right" size={16} />
      </div>
    </Link>
  );
}
