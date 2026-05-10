"use client";

import type { JSX } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

export type SettingsSectionKey =
  | "agent"
  | "integrations"
  | "billing"
  | "rag"
  | "members"
  | "notifications";

export interface SettingsNavItem {
  key: SettingsSectionKey;
  label: string;
  icon: IconName;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { key: "agent", label: "Agent behavior", icon: "sparkles" },
  { key: "integrations", label: "Integrations", icon: "link" },
  { key: "billing", label: "Billing", icon: "dollar" },
  { key: "rag", label: "Knowledge base", icon: "brain" },
  { key: "members", label: "Members", icon: "users" },
  { key: "notifications", label: "Notifications", icon: "alert" },
];

export interface SettingsNavProps {
  active: SettingsSectionKey;
  onChange: (key: SettingsSectionKey) => void;
}

export function SettingsNav({ active, onChange }: SettingsNavProps): JSX.Element {
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {SETTINGS_NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`settings-nav-item ${active === item.key ? "active" : ""}`.trim()}
          onClick={() => onChange(item.key)}
          aria-current={active === item.key ? "page" : undefined}
        >
          <Icon name={item.icon} size={16} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
