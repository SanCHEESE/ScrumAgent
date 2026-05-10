import type { JSX } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardBody } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { PARTICIPANTS } from "@/lib/mock-data";
import type { Meeting } from "@/lib/types";

export interface ActionsTabProps {
  meeting: Meeting;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDue(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `Due ${month} ${Number(m[3])}`;
}

export function ActionsTab({ meeting }: ActionsTabProps): JSX.Element {
  const m = meeting;
  if (m.actionItems.length === 0) {
    return (
      <Card>
        <CardBody>
          <div className="empty">
            <div className="empty-title">No action items</div>
            <div className="empty-sub">
              {m.status === "done"
                ? "ScrumAgent didn't find any owner-bound commitments in this meeting."
                : "Action items will appear once the meeting is fully analyzed."}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardBody style={{ padding: 0 }}>
        {m.actionItems.map((a) => {
          const p = PARTICIPANTS[a.owner];
          return (
            <div key={a.id} className="action-row">
              <div
                className={`action-check ${a.status === "done" ? "checked" : ""}`}
                aria-hidden
              >
                {a.status === "done" && <Icon name="check" size={12} />}
              </div>
              <div style={{ flex: 1 }}>
                <div className="action-text">{a.text}</div>
                <div className="action-meta">
                  {p && <Avatar participant={p} size={18} />}
                  {p && <span className="action-owner">{p.name}</span>}
                  <span className="action-due">· {formatDue(a.due)}</span>
                  {a.jiraKey && (
                    <span className="action-jira">· {a.jiraKey}</span>
                  )}
                </div>
              </div>
              <StatusPill status={a.status} />
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
