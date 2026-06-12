"use client";

import type { ChangeEvent, JSX, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  api,
  type AgentSettings,
  type ProjectOut,
  type ResponseStyle,
} from "@/lib/api";
import { Toggle } from "./Toggle";

interface SettingRowProps {
  label: string;
  hint: string;
  control: ReactNode;
}

function SettingRow({ label, hint, control }: SettingRowProps): JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-row-label">
        <div className="setting-row-name">{label}</div>
        <div className="setting-row-hint">{hint}</div>
      </div>
      <div className="setting-row-control">{control}</div>
    </div>
  );
}

const STYLE_LABELS: Record<ResponseStyle, string> = {
  concise: "Concise",
  balanced: "Balanced",
  detailed: "Detailed",
};

const CONTEXT_WINDOW_OPTIONS = [5, 10, 30];

const SAVE_DEBOUNCE_MS = 600;

type SaveState = "idle" | "saving" | "saved" | "error";

function thresholdLabel(value: number): string {
  if (value < 34) return "Low";
  if (value < 67) return "Medium";
  return "High";
}

export function AgentBehaviorSection(): JSX.Element {
  const [projects, setProjects] = useState<ProjectOut[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // (Re)load settings whenever the selected project changes.
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setSettings(null);
    setError(null);
    setSaveState("idle");
    (async () => {
      try {
        const loaded = await api.getAgentSettings(projectId);
        if (active) setSettings(loaded);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof ApiError ? e.message : "Could not load settings.");
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  // Debounced autosave: every change schedules a PUT of the full settings.
  const update = useCallback(
    (patch: Partial<AgentSettings>) => {
      if (!projectId) return;
      setSettings((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setSaveState("saving");
        saveTimer.current = setTimeout(() => {
          api
            .putAgentSettings(projectId, next)
            .then(() => setSaveState("saved"))
            .catch((e: unknown) => {
              if (e instanceof ApiError && e.status === 401) return;
              setSaveState("error");
            });
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [projectId],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

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
        No projects yet — create a project to configure its agent.
      </div>
    );
  }

  const saveLabel: Record<SaveState, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Could not save — changes are not persisted",
  };

  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <SettingRow
          label="Project"
          hint="Agent behavior is configured per project."
          control={
            <div className="hstack" style={{ gap: 10, alignItems: "center" }}>
              <span
                className="mono muted"
                style={{
                  fontSize: 11,
                  ...(saveState === "error" ? { color: "var(--danger)" } : {}),
                }}
                role={saveState === "error" ? "alert" : "status"}
              >
                {saveLabel[saveState]}
              </span>
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
          }
        />
      </div>

      {settings === null ? (
        <div className="muted" style={{ padding: "16px 0" }}>
          Loading settings…
        </div>
      ) : (
        <>
          <div className="setting-group">
            <h2 className="setting-group-title">Meeting participation</h2>
            <p className="setting-group-sub">
              What the agent does when it joins a Google Meet call.
            </p>
            <SettingRow
              label="Auto-join meetings"
              hint="Join any Google Calendar event tagged with the agent address."
              control={
                <Toggle
                  on={settings.auto_join_meetings}
                  onChange={(v) => update({ auto_join_meetings: v })}
                  ariaLabel="Auto-join meetings"
                />
              }
            />
            <SettingRow
              label="Record audio"
              hint="Capture the call audio for transcription. Required for Whisper STT."
              control={
                <Toggle
                  on={settings.record_audio}
                  onChange={(v) => update({ record_audio: v })}
                  ariaLabel="Record audio"
                />
              }
            />
            <SettingRow
              label="Capture screenshots"
              hint="Snapshot shared screens for visual context. Adds to storage cost."
              control={
                <Toggle
                  on={settings.capture_screenshots}
                  onChange={(v) => update({ capture_screenshots: v })}
                  ariaLabel="Capture screenshots"
                />
              }
            />
          </div>

          <div className="setting-group">
            <h2 className="setting-group-title">Update proposals</h2>
            <p className="setting-group-sub">
              How the agent decides when to push Jira and Notion changes.
            </p>
            <SettingRow
              label="Confidence threshold"
              hint="Updates below this score are surfaced for review instead of auto-applied."
              control={
                <div className="range-track">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.confidence_threshold}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      update({ confidence_threshold: Number(e.target.value) })
                    }
                    className="range-slider"
                    aria-label="Confidence threshold"
                  />
                  <div className="range-track-marks">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                  <div
                    className="mono muted"
                    style={{ fontSize: 11, textAlign: "right" }}
                  >
                    {settings.confidence_threshold}% ·{" "}
                    {thresholdLabel(settings.confidence_threshold)}
                  </div>
                </div>
              }
            />
            <SettingRow
              label="Auto-apply high-confidence updates"
              hint="Apply Jira/Notion updates tagged High without manual approval."
              control={
                <Toggle
                  on={settings.auto_apply_high_confidence}
                  onChange={(v) => update({ auto_apply_high_confidence: v })}
                  ariaLabel="Auto-apply high-confidence updates"
                />
              }
            />
          </div>

          <div className="setting-group">
            <h2 className="setting-group-title">Response style</h2>
            <p className="setting-group-sub">
              Tone for chat replies and meeting summaries.
            </p>
            <SettingRow
              label="Voice of the agent"
              hint="Concise sticks to bullet points. Detailed adds reasoning and context."
              control={
                <select
                  className="select"
                  style={{ width: 200 }}
                  value={settings.response_style}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    update({ response_style: e.target.value as ResponseStyle })
                  }
                  aria-label="Voice of the agent"
                >
                  {(Object.keys(STYLE_LABELS) as ResponseStyle[]).map((s) => (
                    <option key={s} value={s}>
                      {STYLE_LABELS[s]}
                    </option>
                  ))}
                </select>
              }
            />
            <SettingRow
              label="Default context window"
              hint="How much meeting history the agent retrieves by default."
              control={
                <select
                  className="select"
                  style={{ width: 220 }}
                  value={settings.context_window_meetings}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    update({ context_window_meetings: Number(e.target.value) })
                  }
                  aria-label="Default context window"
                >
                  {CONTEXT_WINDOW_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      Last {n} meetings
                    </option>
                  ))}
                </select>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
