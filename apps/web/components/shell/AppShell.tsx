"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LiveBar } from "./LiveBar";
import { ProjectMeetingsProvider } from "./ProjectMeetingsProvider";
import { ProjectSwitcherModal } from "./ProjectSwitcherModal";
import { Sidebar } from "./Sidebar";
import { TweaksPanel } from "@/components/tweaks/TweaksPanel";

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
    // One fan-out of every project's calendar, shared by the Sidebar badge and
    // the home/meetings consumers (ScrumAgent-iar).
    <ProjectMeetingsProvider>
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
        {/* Floating tweaks panel — only mounts inside the shell layout, so
            /login (which uses a sibling layout) doesn't render it. */}
        <TweaksPanel />
      </div>
    </ProjectMeetingsProvider>
  );
}
