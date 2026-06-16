"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ApiError, api, type ProjectOut } from "@/lib/api";
import type { Project } from "@/lib/types";

interface ActiveProjectContextValue {
  activeProject: Project;
  projects: Project[];
  setActiveProjectById: (id: string) => void;
}

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(
  null,
);

const NO_PROJECT: Project = {
  id: "__no-project__",
  name: "No project selected",
  email: "Create or join a project",
  description: "",
  lastSync: null,
  status: "never_synced",
  meetings: 0,
  pending: 0,
};

function toViewProject(p: ProjectOut): Project {
  return {
    id: p.id,
    name: p.name,
    email: p.agent_email,
    description: p.description ?? "",
    lastSync: null,
    status: p.google_connected ? "active" : "error",
    meetings: 0,
    pending: 0,
  };
}

export interface ActiveProjectProviderProps {
  children: ReactNode;
  /** Optional override for the initial active project. */
  initialProjectId?: string;
}

export function ActiveProjectProvider({
  children,
  initialProjectId,
}: ActiveProjectProviderProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    initialProjectId ?? null,
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await api.listProjects();
        if (!active) return;
        const nextProjects = rows.map(toViewProject);
        setProjects(nextProjects);
        setActiveId((current) => {
          if (current && nextProjects.some((p) => p.id === current)) {
            return current;
          }
          if (
            initialProjectId &&
            nextProjects.some((p) => p.id === initialProjectId)
          ) {
            return initialProjectId;
          }
          return nextProjects[0]?.id ?? null;
        });
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setProjects([]);
        setActiveId(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [initialProjectId]);

  const setActiveProjectById = useCallback((id: string) => {
    setActiveId((current) =>
      projects.some((p) => p.id === id) ? id : current,
    );
  }, [projects]);

  const value = useMemo<ActiveProjectContextValue>(() => {
    const active =
      projects.find((p) => p.id === activeId) ?? projects[0] ?? NO_PROJECT;
    return {
      activeProject: active,
      projects,
      setActiveProjectById,
    };
  }, [activeId, projects, setActiveProjectById]);

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
