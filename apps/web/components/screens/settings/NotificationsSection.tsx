"use client";

import type { JSX } from "react";
import { useState } from "react";
import { Toggle } from "./Toggle";

type Channel = "email" | "slack" | "inapp";

interface NotificationEvent {
  key: string;
  label: string;
  hint: string;
}

const EVENTS: NotificationEvent[] = [
  {
    key: "newUpdate",
    label: "New update proposed",
    hint: "Agent suggests a Jira/Notion change above the confidence threshold.",
  },
  {
    key: "meetingAnalyzed",
    label: "Meeting analyzed",
    hint: "Transcript and decisions are ready to review.",
  },
  {
    key: "agentError",
    label: "Agent error",
    hint: "A pipeline run failed and could not auto-recover.",
  },
  {
    key: "budgetAlert",
    label: "Budget alert",
    hint: "Cycle spend crossed 75 % or projected to exceed the cap.",
  },
  {
    key: "weeklyDigest",
    label: "Weekly digest",
    hint: "Summary of meetings, decisions, and pending updates each Monday.",
  },
];

type ToggleKey = `${string}:${Channel}`;

const DEFAULT_STATE: Record<ToggleKey, boolean> = {
  "newUpdate:email": true,
  "newUpdate:slack": true,
  "newUpdate:inapp": true,
  "meetingAnalyzed:email": false,
  "meetingAnalyzed:slack": true,
  "meetingAnalyzed:inapp": true,
  "agentError:email": true,
  "agentError:slack": true,
  "agentError:inapp": true,
  "budgetAlert:email": true,
  "budgetAlert:slack": false,
  "budgetAlert:inapp": true,
  "weeklyDigest:email": true,
  "weeklyDigest:slack": false,
  "weeklyDigest:inapp": false,
};

export function NotificationsSection(): JSX.Element {
  const [state, setState] = useState<Record<ToggleKey, boolean>>(DEFAULT_STATE);

  const set = (eventKey: string, channel: Channel, value: boolean): void => {
    const k = `${eventKey}:${channel}` as ToggleKey;
    setState((s) => ({ ...s, [k]: value }));
  };

  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <h2 className="setting-group-title">Notifications</h2>
        <p className="setting-group-sub">
          Pick how you want to hear from the agent for each event type.
        </p>

        <table className="notifications-matrix">
          <thead>
            <tr>
              <th>Event</th>
              <th>Email</th>
              <th>Slack</th>
              <th>In-app</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((ev) => (
              <tr key={ev.key}>
                <td>
                  <div style={{ fontWeight: 500 }}>{ev.label}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {ev.hint}
                  </div>
                </td>
                {(["email", "slack", "inapp"] as const).map((ch) => {
                  const k = `${ev.key}:${ch}` as ToggleKey;
                  return (
                    <td key={ch}>
                      <div style={{ display: "inline-flex" }}>
                        <Toggle
                          on={state[k] ?? false}
                          onChange={(v) => set(ev.key, ch, v)}
                          ariaLabel={`${ev.label} via ${ch}`}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
