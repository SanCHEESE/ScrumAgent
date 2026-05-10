"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LiveBar } from "./LiveBar";
import { ProjectSwitcherModal } from "./ProjectSwitcherModal";
import { Sidebar } from "./Sidebar";

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Composes the LiveBar + Sidebar + main grid that the prototype's <App> renders.
 * Routes that should NOT show the shell (e.g. /login) use a sibling layout that
 * skips this wrapper entirely.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const [navCollapsed] = useState(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);

  return (
    <div
      className={`app ${navCollapsed ? "nav-collapsed" : ""}`}
      data-screen-label={pathname}
    >
      <LiveBar />
      <Sidebar onSwitchProject={() => setProjectSwitcherOpen(true)} />
      <main className="main" data-screen-label={`main-${pathname}`}>
        {children}
      </main>
      <ProjectSwitcherModal
        open={projectSwitcherOpen}
        onClose={() => setProjectSwitcherOpen(false)}
      />
    </div>
  );
}
