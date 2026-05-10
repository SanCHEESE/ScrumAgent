import type { JSX } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import type { Meeting } from "@/lib/types";

export interface OutputsTabProps {
  meeting: Meeting;
}

export function OutputsTab({ meeting }: OutputsTabProps): JSX.Element {
  const m = meeting;
  if (m.jiraIssues.length === 0 && m.notionPages.length === 0) {
    return (
      <Card>
        <CardBody>
          <div className="empty">
            <div className="empty-title">No outputs yet</div>
            <div className="empty-sub">
              {m.status === "done"
                ? "ScrumAgent didn't link any Jira or Notion artifacts to this meeting."
                : "Outputs appear once the agent finishes analyzing the meeting."}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="vstack">
      {m.jiraIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Icon name="jira" size={14} /> Jira
            </CardTitle>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            {m.jiraIssues.map((j) => (
              <div key={j.key} className="output-row">
                <span
                  className="mono"
                  style={{ color: "var(--brand-500)", fontWeight: 600 }}
                >
                  {j.key}
                </span>
                <span style={{ flex: 1 }}>{j.title}</span>
                <StatusPill status={j.status} />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={`Open ${j.key}`}
                >
                  <Icon name="link" size={12} />
                </button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      {m.notionPages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Icon name="notion" size={14} /> Notion
            </CardTitle>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            {m.notionPages.map((n, i) => (
              <div key={`n-${i}`} className="output-row">
                <span style={{ flex: 1 }}>{n.title}</span>
                <button type="button" className="btn btn-ghost btn-sm">
                  <Icon name="link" size={12} /> Open
                </button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
