import { UPDATES } from "./mock-data";
import type { NavItem } from "./types";

const pendingUpdates = UPDATES.filter((u) => u.status === "pending").length;

/**
 * Sidebar navigation. Mirrors the NAV array in
 * .worktrees/_design-bundle/project/kabanchik-app.jsx, mapped to App Router routes.
 */
export const NAV: NavItem[] = [
  { key: "home", label: "Home", icon: "home", href: "/" },
  { key: "chat", label: "Ask agent", icon: "chat", href: "/chat" },
  {
    key: "meetings",
    label: "Meetings",
    icon: "calendar",
    href: "/meetings",
    badge: 2,
  },
  {
    key: "updates",
    label: "Updates",
    icon: "check",
    href: "/updates",
    badge: pendingUpdates,
    badgeWarn: true,
  },
  { key: "trace", label: "Agent trace", icon: "trace", href: "/trace" },
  { key: "projects", label: "Projects", icon: "folder", href: "/projects" },
  { key: "settings", label: "Settings", icon: "settings", href: "/settings" },
];
