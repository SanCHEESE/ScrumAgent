"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { PROJECTS } from "@/lib/mock-data";
import type { Project } from "@/lib/types";

interface ActiveProjectContextValue {
  activeProject: Project;
  projects: Project[];
  setActiveProjectById: (id: string) => void;
}

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(
  null,
);

export interface ActiveProjectProviderProps {
  children: ReactNode;
  /** Optional override for the initial active project (defaults to PROJECTS[0]). */
  initialProjectId?: string;
}

export function ActiveProjectProvider({
  children,
  initialProjectId,
}: ActiveProjectProviderProps) {
  const initial =
    PROJECTS.find((p) => p.id === initialProjectId) ?? PROJECTS[0];
  const [activeId, setActiveId] = useState<string>(initial.id);

  const setActiveProjectById = useCallback((id: string) => {
    if (PROJECTS.some((p) => p.id === id)) setActiveId(id);
  }, []);

  const value = useMemo<ActiveProjectContextValue>(() => {
    const active = PROJECTS.find((p) => p.id === activeId) ?? PROJECTS[0];
    return {
      activeProject: active,
      projects: PROJECTS,
      setActiveProjectById,
    };
  }, [activeId, setActiveProjectById]);

  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

export function useActiveProject(): ActiveProjectContextValue {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) {
    throw new Error(
      "useActiveProject must be used inside <ActiveProjectProvider>",
    );
  }
  return ctx;
}
