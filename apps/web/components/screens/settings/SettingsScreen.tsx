"use client";

import type { JSX } from "react";
import { useState } from "react";
import { AgentBehaviorSection } from "./AgentBehaviorSection";
import { BillingSection } from "./BillingSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { MembersSection } from "./MembersSection";
import { NotificationsSection } from "./NotificationsSection";
import { SettingsNav, type SettingsSectionKey } from "./SettingsNav";

const TITLES: Record<SettingsSectionKey, { title: string; subtitle: string }> = {
  agent: {
    title: "Agent behavior",
    subtitle: "How the agent joins meetings, proposes updates, and replies in chat.",
  },
  integrations: {
    title: "Integrations",
    subtitle: "Connect Google, Atlassian, Notion, OpenAI, and Slack.",
  },
  billing: {
    title: "Billing",
    subtitle: "Cycle spend, cost breakdown, API keys, and per-model usage.",
  },
  rag: {
    title: "Knowledge base",
    subtitle: "Indexed sources, reindex schedule, and search index quality.",
  },
  members: {
    title: "Members",
    subtitle: "Team members and their roles in this project.",
  },
  notifications: {
    title: "Notifications",
    subtitle: "Per-event channel preferences for email, Slack, and in-app.",
  },
};

export function SettingsScreen(): JSX.Element {
  const [active, setActive] = useState<SettingsSectionKey>("agent");
  const meta = TITLES[active];

  let body: JSX.Element;
  switch (active) {
    case "agent":
      body = <AgentBehaviorSection />;
      break;
    case "integrations":
      body = <IntegrationsSection />;
      break;
    case "billing":
      body = <BillingSection />;
      break;
    case "rag":
      body = <KnowledgeBaseSection />;
      break;
    case "members":
      body = <MembersSection />;
      break;
    case "notifications":
      body = <NotificationsSection />;
      break;
  }

  // Billing has its own internal cards with their own backgrounds — render
  // it without the wrapping `.settings-content` panel so the cards can
  // breathe edge-to-edge.
  const isBilling = active === "billing";

  return (
    <div className="page wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">{meta.title}</h1>
          <div className="page-subtitle">{meta.subtitle}</div>
        </div>
      </div>

      <div className="settings-layout">
        <SettingsNav active={active} onChange={setActive} />
        {isBilling ? (
          <div>{body}</div>
        ) : (
          <div className="settings-content">{body}</div>
        )}
      </div>
    </div>
  );
}
