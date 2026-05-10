import type { JSX, ReactElement, SVGProps } from "react";

// Icon registry — paths ported verbatim from
// .worktrees/_design-bundle/project/kabanchik-ui.jsx.
//
// Each entry is the children of a 24x24 currentColor SVG.

export type IconName =
  | "home"
  | "chat"
  | "folder"
  | "calendar"
  | "check"
  | "close"
  | "plus"
  | "chevron_right"
  | "chevron_down"
  | "search"
  | "settings"
  | "user"
  | "users"
  | "mic"
  | "trace"
  | "panel_left"
  | "send"
  | "sparkles"
  | "jira"
  | "notion"
  | "google"
  | "link"
  | "copy"
  | "sun"
  | "moon"
  | "alert"
  | "play"
  | "history"
  | "file"
  | "more"
  | "arrow_right"
  | "edit"
  | "dollar"
  | "brain";

const PATHS: Record<IconName, ReactElement> = {
  home: <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1V9.5z" />,
  chat: <path d="M3 12c0-4.4 4-8 9-8s9 3.6 9 8-4 8-9 8c-1.3 0-2.6-.2-3.7-.7L3 21l1.3-4.8C3.5 15 3 13.5 3 12z" />,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  close: <path d="M6 6l12 12M6 18L18 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron_right: <path d="M9 6l6 6-6 6" />,
  chevron_down: <path d="M6 9l6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9 1.65 1.65 0 004.27 7.18l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M17 11a3 3 0 100-6 3 3 0 000 6zM2 21a7 7 0 0114 0M15 14c3 0 7 2 7 6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 12a7 7 0 0014 0M12 19v2" />
    </>
  ),
  trace: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 6h6a4 4 0 010 8M7 18h10" />
    </>
  ),
  panel_left: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  sparkles: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />,
  jira: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 12l3 3 5-5" />
    </>
  ),
  notion: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 8v8M8 8l8 8M16 8v8" />
    </>
  ),
  google: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
  link: <path d="M10 14a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1" />,
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  alert: <path d="M12 3l10 17H2L12 3zM12 10v5M12 18v0.1" />,
  play: <path d="M6 4l14 8-14 8V4z" />,
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  file: <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  arrow_right: <path d="M5 12h14M13 6l6 6-6 6" />,
  edit: <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />,
  dollar: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />,
  brain: <path d="M9 3a3 3 0 00-3 3 3 3 0 00-2 5.2A3 3 0 005 17a3 3 0 003 3 3 3 0 004 0V5a3 3 0 00-3-2zM15 3a3 3 0 013 3 3 3 0 012 5.2A3 3 0 0119 17a3 3 0 01-3 3 3 3 0 01-4 0V5a3 3 0 013-2z" />,
};

export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "name" | "stroke"> {
  name: IconName;
  size?: number;
  /** stroke-width — default 1.5 matches the prototype. */
  stroke?: number;
}

export function Icon({
  name,
  size = 18,
  stroke = 1.5,
  ...rest
}: IconProps): JSX.Element {
  const path = PATHS[name];
  if (!path) {
    return <svg width={size} height={size} aria-hidden {...rest} />;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {path}
    </svg>
  );
}
