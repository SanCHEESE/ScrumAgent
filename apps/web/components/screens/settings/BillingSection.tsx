"use client";

import type { ChangeEvent, JSX } from "react";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api, type Billing, type ProjectOut } from "@/lib/api";
import { BillingSummary } from "./BillingSummary";
import { CostBreakdown } from "./CostBreakdown";
import { RecentInvocations } from "./RecentInvocations";
import { UsageByModel } from "./UsageByModel";

/**
 * Billing — live per-project usage from GET /projects/{id}/billing:
 *   1. Summary cards (cycle spend / plan / activity)
 *   2. Cost breakdown stacked bar
 *   3. Usage by model
 *   4. Recent invocations
 */
export function BillingSection(): JSX.Element {
  const [projects, setProjects] = useState<ProjectOut[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the caller's projects once; default to the first one.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await api.listProjects();
        if (!active) return;
        setProjects(rows);
        setProjectId(rows[0]?.id ?? null);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof ApiError ? e.message : "Could not load projects.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // (Re)load billing whenever the selected project changes.
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setBilling(null);
    setError(null);
    (async () => {
      try {
        const loaded = await api.getBilling(projectId);
        if (active) setBilling(loaded);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof ApiError ? e.message : "Could not load billing.");
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="project-error" role="alert">
        <Icon name="alert" size={12} />
        {error}
      </div>
    );
  }
  if (projects === null) {
    return <div className="muted">Loading projects…</div>;
  }
  if (projects.length === 0) {
    return (
      <div className="muted">
        No projects yet — create a project to see its usage and costs.
      </div>
    );
  }

  return (
    <div className="vstack" style={{ gap: 20, paddingBlock: 20 }}>
      <div className="hstack" style={{ justifyContent: "flex-end" }}>
        <select
          className="select"
          style={{ width: 220 }}
          value={projectId ?? ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setProjectId(e.target.value)
          }
          aria-label="Project"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {billing === null ? (
        <div className="muted">Loading billing…</div>
      ) : (
        <>
          <BillingSummary billing={billing} />
          <CostBreakdown billing={billing} />
          <UsageByModel models={billing.by_model} />
          <RecentInvocations recent={billing.recent} />
        </>
      )}
    </div>
  );
}
