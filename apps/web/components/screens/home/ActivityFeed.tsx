import type { JSX } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

interface ActivityItem {
  agent: string;
  action: string;
  ts: string;
  icon: IconName;
}

// Ported verbatim from .worktrees/_design-bundle/project/screens-home.jsx (ACTIVITY).
const ACTIVITY: ActivityItem[] = [
  { agent: "meeting_participation", action: "Joined Daily Standup", ts: "10:00", icon: "mic" },
  { agent: "meeting_participation", action: "Analyzed transcript (8 utterances)", ts: "10:17", icon: "sparkles" },
  { agent: "jira_notion", action: "Proposed 3 Jira updates", ts: "10:18", icon: "jira" },
  { agent: "jira_notion", action: "Proposed 2 Notion edits", ts: "10:18", icon: "notion" },
  { agent: "meeting_participation", action: "Queued Sprint Planning analysis", ts: "14:35", icon: "calendar" },
];

/**
 * Renders the static "Agent activity" feed shown in the right column of the
 * split / classic Home layouts.
 */
export function ActivityFeed(): JSX.Element {
  return (
    <div className="activity-feed">
      {ACTIVITY.map((a, i) => (
        <div key={i} className="activity-row">
          <div className="activity-icon">
            <Icon name={a.icon} size={14} />
          </div>
          <div className="activity-body">
            <div className="activity-action">{a.action}</div>
            <div className="activity-meta">
              <span className="mono">{a.agent}</span> · {a.ts}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
