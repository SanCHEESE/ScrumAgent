"use client";

import type { ChangeEvent, JSX } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  api,
  type KnowledgeBaseStatus,
  type ProjectOut,
  type ProjectRole,
} from "@/lib/api";
import { Toggle } from "./Toggle";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const RUN_STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  partial: "Partial",
  failed: "Failed",
  running: "Running",
  pending: "Pending",
};

export function KnowledgeBaseSection(): JSX.Element {
  const [projects, setProjects] = useState<ProjectOut[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [status, setStatus] = useState<KnowledgeBaseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [toggleErr, setToggleErr] = useState<string | null>(null);

  // Load projects + the current user once.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rows, me] = await Promise.all([api.listProjects(), api.me()]);
        if (!active) return;
        setProjects(rows);
        setProjectId(rows[0]?.id ?? null);
        setMeId(me.id);
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

  // (Re)load the knowledge-base status whenever the selected project changes.
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setStatus(null);
    setError(null);
    setSyncMsg(null);
    setSyncErr(null);
    setToggleErr(null);
    (async () => {
      try {
        const loaded = await api.getKnowledgeBaseStatus(projectId);
        if (active) setStatus(loaded);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError(
          e instanceof ApiError ? e.message : "Could not load the knowledge base.",
        );
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
        No projects yet — create a project to build its knowledge base.
      </div>
    );
  }

  const project = projects.find((p) => p.id === projectId) ?? null;
  // Admins manage sync; in the see-all preview env the dev user isn't a member,
  // so an unknown role is treated as manageable (the backend still enforces).
  const myRole: ProjectRole | undefined = project?.members.find(
    (m) => m.user_id === meId,
  )?.role;
  const canManage = myRole === undefined || myRole === "admin";

  const onToggleAutoSync = (next: boolean) => {
    if (!projectId || !status) return;
    setToggleErr(null);
    setStatus({
      ...status,
      auto_sync_enabled: next,
      next_sync_at: next ? status.next_sync_at : null,
    });
    api
      .setKnowledgeBaseAutoSync(projectId, next)
      .then((s) =>
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                auto_sync_enabled: s.auto_sync_enabled,
                auto_sync_interval_hours: s.auto_sync_interval_hours,
                next_sync_at: s.next_sync_at,
              }
            : prev,
        ),
      )
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return;
        setStatus((prev) =>
          prev ? { ...prev, auto_sync_enabled: !next } : prev,
        );
        setToggleErr(
          e instanceof ApiError ? e.message : "Could not update auto-sync.",
        );
      });
  };

  const onSyncNow = () => {
    if (!projectId) return;
    setSyncing(true);
    setSyncMsg(null);
    setSyncErr(null);
    api
      .resyncKnowledgeBase(projectId)
      .then(() => {
        setSyncMsg("Re-sync started — this can take a few minutes.");
        return api.getKnowledgeBaseStatus(projectId);
      })
      .then((s) => setStatus(s))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return;
        setSyncErr(
          e instanceof ApiError ? e.message : "Could not start a re-sync.",
        );
      })
      .finally(() => setSyncing(false));
  };

  const jiraCount =
    status?.rag?.by_source_kind?.jira ?? status?.last_run?.jira_submitted ?? 0;
  const notionCount =
    status?.rag?.by_source_kind?.notion ??
    status?.last_run?.notion_submitted ??
    0;
  const interval = status?.auto_sync_interval_hours ?? 6;

  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <div className="setting-row">
          <div className="setting-row-label">
            <div className="setting-row-name">Project</div>
            <div className="setting-row-hint">
              The knowledge base is built per project.
            </div>
          </div>
          <div className="setting-row-control">
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
        </div>
      </div>

      {status === null ? (
        <div className="muted" style={{ padding: "16px 0" }}>
          Loading knowledge base…
        </div>
      ) : (
        <>
          <div className="setting-group">
            <h2 className="setting-group-title">Indexed sources</h2>
            <p className="setting-group-sub">
              The agent reads from these to answer questions in chat.
            </p>
            <div className="kb-sources">
              <div className="kb-source-card">
                <div className="kb-source-icon">
                  <Icon name="jira" size={16} />
                </div>
                <div className="kb-source-name">Jira issues</div>
                <div className="kb-source-count">{jiraCount}</div>
                <div className="kb-source-sub">indexed</div>
              </div>
              <div className="kb-source-card">
                <div className="kb-source-icon">
                  <Icon name="notion" size={16} />
                </div>
                <div className="kb-source-name">Notion pages</div>
                <div className="kb-source-count">{notionCount}</div>
                <div className="kb-source-sub">indexed</div>
              </div>
              <div className="kb-source-card">
                <div className="kb-source-icon">
                  <Icon name="mic" size={16} />
                </div>
                <div className="kb-source-name">Meeting transcripts</div>
                <div className="kb-source-count">—</div>
                <div className="kb-source-sub">indexed when meetings ship</div>
              </div>
            </div>
          </div>

          <div className="setting-group">
            <h2 className="setting-group-title">Index health</h2>
            <p className="setting-group-sub">
              {status.last_run
                ? `Last sync: ${formatWhen(status.last_run.finished_at)} · ${
                    RUN_STATUS_LABEL[status.last_run.status] ??
                    status.last_run.status
                  } · ${status.last_run.trigger}`
                : "Never synced yet."}
            </p>
            <div className="kb-health">
              <div className="kb-health-card">
                <div className="kb-health-label">Documents indexed</div>
                <div className="kb-health-value">
                  {status.rag ? status.rag.total : "—"}
                </div>
              </div>
              {status.rag
                ? Object.entries(status.rag.by_status).map(([k, v]) => (
                    <div key={k} className="kb-health-card">
                      <div className="kb-health-label">{k}</div>
                      <div className="kb-health-value">{v}</div>
                    </div>
                  ))
                : null}
              {status.last_run && status.last_run.failed_count > 0 ? (
                <div className="kb-health-card">
                  <div className="kb-health-label">Failed sources</div>
                  <div className="kb-health-value">
                    {status.last_run.failed_count}
                  </div>
                </div>
              ) : null}
            </div>
            {!status.rag ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Live index counts are unavailable right now.
              </p>
            ) : null}
            {status.last_run?.error ? (
              <p
                className="muted"
                role="alert"
                style={{ fontSize: 12, marginTop: 8, color: "var(--danger)" }}
              >
                Last sync error: {status.last_run.error}
              </p>
            ) : null}

            <div className="setting-row" style={{ marginTop: 12 }}>
              <div className="setting-row-label">
                <div className="setting-row-name">Automatic sync</div>
                <div className="setting-row-hint">
                  {status.auto_sync_enabled
                    ? `On · every ${interval}h${
                        status.next_sync_at
                          ? ` · next ${formatWhen(status.next_sync_at)}`
                          : " · pending first sync"
                      }`
                    : "Off — the backlog won't refresh on its own."}
                </div>
              </div>
              <div className="setting-row-control">
                {canManage ? (
                  <Toggle
                    on={status.auto_sync_enabled}
                    onChange={onToggleAutoSync}
                    ariaLabel="Automatic sync"
                  />
                ) : (
                  <span className="mono muted" aria-label="Automatic sync">
                    {status.auto_sync_enabled ? "On" : "Off"}
                  </span>
                )}
              </div>
            </div>
            {toggleErr ? (
              <p
                className="muted"
                role="alert"
                style={{ fontSize: 12, color: "var(--danger)" }}
              >
                {toggleErr}
              </p>
            ) : null}

            {canManage ? (
              <div className="hstack" style={{ marginTop: 14, gap: 10, alignItems: "center" }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSyncNow}
                  disabled={syncing}
                >
                  <Icon name="play" size={14} />
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
                {syncMsg ? (
                  <span className="mono muted" style={{ fontSize: 11 }} role="status">
                    {syncMsg}
                  </span>
                ) : null}
                {syncErr ? (
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--danger)" }}
                    role="alert"
                  >
                    {syncErr}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                Only project admins can sync the knowledge base.
              </p>
            )}
          </div>

          <div className="setting-group">
            <h2 className="setting-group-title">Search index test</h2>
            <p className="setting-group-sub">
              Search will be available when chat ships — it runs queries against
              this project&apos;s knowledge base.
            </p>
            <div className="input-search" style={{ maxWidth: 520, opacity: 0.6 }}>
              <Icon name="search" size={14} />
              <input
                type="search"
                className="input-bare"
                placeholder="Search becomes available when chat ships"
                disabled
                aria-label="Search index test"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
