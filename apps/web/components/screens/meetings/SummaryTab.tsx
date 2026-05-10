import type { JSX } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { PARTICIPANTS } from "@/lib/mock-data";
import type { Meeting } from "@/lib/types";
import { renderMarkdown } from "./markdown";

export interface SummaryTabProps {
  meeting: Meeting;
}

export function SummaryTab({ meeting }: SummaryTabProps): JSX.Element {
  const m = meeting;
  return (
    <div className="card-grid-2">
      <Card>
        <CardHeader>
          <CardTitle>AI Summary</CardTitle>
          <button type="button" className="btn btn-ghost btn-sm">
            <Icon name="copy" size={12} /> Copy
          </button>
        </CardHeader>
        <CardBody
          className="meeting-summary"
          style={{ padding: "24px 3px 24px 24px" }}
        >
          {renderMarkdown(m.summary)}
        </CardBody>
      </Card>

      <div className="vstack">
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            {m.participants.map((pid) => {
              const p = PARTICIPANTS[pid];
              if (!p) return null;
              const firstName = p.name.split(" ")[0];
              const spoke = m.transcript.filter(
                (t) => t.speaker === firstName,
              ).length;
              return (
                <div key={pid} className="participant-row">
                  <Avatar participant={p} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    <div
                      className="muted mono"
                      style={{ fontSize: 11 }}
                    >
                      {spoke} utterance{spoke !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        {(m.jiraIssues.length > 0 || m.notionPages.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Linked outputs</CardTitle>
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              {m.jiraIssues.map((j) => (
                <div key={j.key} className="output-row">
                  <Icon name="jira" size={14} />
                  <span
                    className="mono"
                    style={{ color: "var(--brand-500)" }}
                  >
                    {j.key}
                  </span>
                  <span style={{ flex: 1 }}>{j.title}</span>
                  <StatusPill status={j.status} />
                </div>
              ))}
              {m.notionPages.map((n, i) => (
                <div key={`n-${i}`} className="output-row">
                  <Icon name="notion" size={14} />
                  <span style={{ flex: 1 }}>{n.title}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Open ${n.title}`}
                  >
                    <Icon name="link" size={12} />
                  </button>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
