"use client";

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { weeklyMeetingStats } from "@/lib/meeting-stats";
import { NAV } from "@/lib/nav";
import { useActiveProject } from "./ActiveProjectProvider";
import { useProjectMeetings } from "./ProjectMeetingsProvider";
import { UserMenu } from "./UserMenu";

const HOME_HREF = "/";

function isActive(pathname: string, href: string): boolean {
  if (href === HOME_HREF) return pathname === HOME_HREF;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SidebarProps {
  onSwitchProject: () => void;
}

export function Sidebar({ onSwitchProject }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname() ?? HOME_HREF;
  const { activeProject, status } = useActiveProject();
  const { meetings, failures } = useProjectMeetings();

  // Live current-week count from the shared per-project calendar fan-out.
  const meetingsBadge = useMemo(
    () => weeklyMeetingStats(meetings, new Date()).currentWeek,
    [meetings],
  );
  // Only hard failures (not 409 "no calendar connected") leave the count
  // possibly-incomplete; flag the badge when any occurred.
  const meetingsFailed = failures.filter((f) => f.status !== 409).length;

  const goHome = () => router.push(HOME_HREF);

  // While projects are still loading, or when the fetch failed, don't render the
  // NO_PROJECT sentinel ("No project selected") in the switcher — on a backend
  // error that reads as "you have no projects" rather than "couldn't load"
  // (review #5 / ScrumAgent-hky). A genuinely-empty (ready) account still shows it.
  const switcherName =
    status === "error"
      ? "Couldn't load projects"
      : status === "loading"
        ? "Loading…"
        : activeProject.name;
  const switcherBody =
    status === "error"
      ? "Reload to try again"
      : status === "loading"
        ? ""
        : activeProject.email;

  return (
    <aside className="sidebar">
      <div
        className="sidebar-header"
        role="button"
        tabIndex={0}
        title="Home"
        style={{ cursor: "pointer" }}
        onClick={goHome}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goHome();
          }
        }}
      >
        <div className="logo" aria-label="Kabanchik">
          <img src="/kabanchik-boar.svg" alt="Running boar silhouette" />
        </div>
        <div className="logo-text">Kabanchik</div>
      </div>

      <div
        className="project-switcher"
        role="button"
        tabIndex={0}
        onClick={onSwitchProject}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSwitchProject();
          }
        }}
      >
        <div className="project-switcher-header">
          <div className={`project-dot ${activeProject.status}`} />
          <div className="project-name">{switcherName}</div>
          <Icon name="chevron_down" size={14} />
        </div>
        <div className="project-switcher-body">{switcherBody}</div>
      </div>

      <nav className="nav" aria-label="Primary">
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
          const badge = n.key === "meetings" ? meetingsBadge : n.badge;
          // Only the live meetings badge can under-report; flag it when some
          // project calendars failed so the number isn't read as authoritative.
          const badgeTitle =
            n.key === "meetings" && meetingsFailed > 0
              ? `${meetingsFailed} calendar${
                  meetingsFailed === 1 ? "" : "s"
                } failed to load — count may be incomplete`
              : undefined;
          return (
            <div
              key={n.key}
              className={`nav-item ${active ? "active" : ""}`}
              role="link"
              tabIndex={0}
              aria-current={active ? "page" : undefined}
              onClick={() => router.push(n.href)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(n.href);
                }
              }}
            >
              <div className="nav-icon">
                <Icon name={n.icon as Parameters<typeof Icon>[0]["name"]} size={18} />
              </div>
              <div className="nav-label">{n.label}</div>
              {badge !== undefined && badge > 0 && (
                <div
                  className={`nav-badge ${n.badgeWarn ? "warn" : ""}`}
                  title={badgeTitle}
                  aria-label={badgeTitle}
                >
                  {badge}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <UserMenu />
      </div>
    </aside>
  );
}
