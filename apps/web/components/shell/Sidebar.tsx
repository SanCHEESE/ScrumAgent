"use client";

import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NAV } from "@/lib/nav";
import { useActiveProject } from "./ActiveProjectProvider";
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
  const { activeProject } = useActiveProject();

  const goHome = () => router.push(HOME_HREF);

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
          <span role="img" aria-label="boar" style={{ fontSize: 20, lineHeight: 1 }}>
            🐗
          </span>
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
          <div className="project-name">{activeProject.name}</div>
          <Icon name="chevron_down" size={14} />
        </div>
        <div className="project-switcher-body">{activeProject.email}</div>
      </div>

      <nav className="nav" aria-label="Primary">
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
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
              {n.badge !== undefined && n.badge > 0 && (
                <div className={`nav-badge ${n.badgeWarn ? "warn" : ""}`}>
                  {n.badge}
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
