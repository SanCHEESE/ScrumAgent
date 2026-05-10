"use client";

import type { ChangeEvent, JSX, ReactNode } from "react";
import { useState } from "react";
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

interface AgentBehaviorState {
  autoJoin: boolean;
  recordAudio: boolean;
  captureScreenshots: boolean;
  confidenceThreshold: number;
  autoApply: boolean;
  responseStyle: string;
  contextWindow: string;
}

const INITIAL_STATE: AgentBehaviorState = {
  autoJoin: true,
  recordAudio: true,
  captureScreenshots: false,
  confidenceThreshold: 70,
  autoApply: true,
  responseStyle: "Balanced",
  contextWindow: "Last 10 meetings",
};

function thresholdLabel(value: number): string {
  if (value < 34) return "Low";
  if (value < 67) return "Medium";
  return "High";
}

export function AgentBehaviorSection(): JSX.Element {
  const [state, setState] = useState<AgentBehaviorState>(INITIAL_STATE);

  const set =
    <K extends keyof AgentBehaviorState>(key: K) =>
    (value: AgentBehaviorState[K]) =>
      setState((s) => ({ ...s, [key]: value }));

  const onSelect = (key: "responseStyle" | "contextWindow") =>
    (e: ChangeEvent<HTMLSelectElement>) =>
      set(key)(e.target.value);

  const onSlider = (e: ChangeEvent<HTMLInputElement>) =>
    set("confidenceThreshold")(Number(e.target.value));

  return (
    <div className="vstack" style={{ gap: 0 }}>
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
              on={state.autoJoin}
              onChange={set("autoJoin")}
              ariaLabel="Auto-join meetings"
            />
          }
        />
        <SettingRow
          label="Record audio"
          hint="Capture the call audio for transcription. Required for Whisper STT."
          control={
            <Toggle
              on={state.recordAudio}
              onChange={set("recordAudio")}
              ariaLabel="Record audio"
            />
          }
        />
        <SettingRow
          label="Capture screenshots"
          hint="Snapshot shared screens for visual context. Adds to storage cost."
          control={
            <Toggle
              on={state.captureScreenshots}
              onChange={set("captureScreenshots")}
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
                value={state.confidenceThreshold}
                onChange={onSlider}
                className="range-slider"
                aria-label="Confidence threshold"
              />
              <div className="range-track-marks">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
              <div className="mono muted" style={{ fontSize: 11, textAlign: "right" }}>
                {state.confidenceThreshold}% · {thresholdLabel(state.confidenceThreshold)}
              </div>
            </div>
          }
        />
        <SettingRow
          label="Auto-apply high-confidence updates"
          hint="Apply Jira/Notion updates tagged High without manual approval."
          control={
            <Toggle
              on={state.autoApply}
              onChange={set("autoApply")}
              ariaLabel="Auto-apply high-confidence updates"
            />
          }
        />
      </div>

      <div className="setting-group">
        <h2 className="setting-group-title">Response style</h2>
        <p className="setting-group-sub">Tone for chat replies and meeting summaries.</p>
        <SettingRow
          label="Voice of the agent"
          hint="Concise sticks to bullet points. Detailed adds reasoning and context."
          control={
            <select
              className="select"
              style={{ width: 200 }}
              value={state.responseStyle}
              onChange={onSelect("responseStyle")}
              aria-label="Voice of the agent"
            >
              <option>Concise</option>
              <option>Balanced</option>
              <option>Detailed</option>
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
              value={state.contextWindow}
              onChange={onSelect("contextWindow")}
              aria-label="Default context window"
            >
              <option>Last 5 meetings</option>
              <option>Last 10 meetings</option>
              <option>Last 30 meetings</option>
            </select>
          }
        />
      </div>
    </div>
  );
}
