"use client";

import { useState, type JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api } from "@/lib/api";
import type { WizardFormData } from "./types";

export interface StepJiraProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; label: string }
  | { kind: "fail"; label: string };

export function StepJira({ data, onChange }: StepJiraProps): JSX.Element {
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const canTest =
    data.jiraSiteUrl.trim() !== "" &&
    data.jiraUserEmail.trim() !== "" &&
    data.jiraApiToken.trim() !== "";

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const result = await api.testJira({
        site_url: data.jiraSiteUrl,
        user_email: data.jiraUserEmail,
        api_token: data.jiraApiToken,
      });
      setTest(
        result.ok
          ? { kind: "ok", label: "Connected" }
          : { kind: "fail", label: result.error ?? "Invalid credentials" },
      );
    } catch (e) {
      setTest({
        kind: "fail",
        label: e instanceof ApiError ? e.message : "Request failed",
      });
    }
  };

  // Editing any field invalidates a prior result.
  const update = (patch: Partial<WizardFormData>) => {
    if (test.kind !== "idle") setTest({ kind: "idle" });
    onChange(patch);
  };

  return (
    <div className="vstack">
      <div>
        <label className="label" htmlFor="jira-url">
          Atlassian site URL
        </label>
        <input
          id="jira-url"
          className="input"
          placeholder="https://municorn.atlassian.net"
          value={data.jiraSiteUrl}
          onChange={(e) => update({ jiraSiteUrl: e.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="jira-email">
          Atlassian account email
        </label>
        <input
          id="jira-email"
          className="input"
          type="email"
          placeholder="agent@municorn.com"
          value={data.jiraUserEmail}
          onChange={(e) => update({ jiraUserEmail: e.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="jira-token">
          API token
        </label>
        <input
          id="jira-token"
          className="input"
          type="password"
          placeholder="Paste a working Atlassian API token"
          value={data.jiraApiToken}
          onChange={(e) => update({ jiraApiToken: e.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="jira-key">
          Default project key
        </label>
        <input
          id="jira-key"
          className="input"
          placeholder="PLAT"
          value={data.jiraProjectKey}
          onChange={(e) => update({ jiraProjectKey: e.target.value.toUpperCase() })}
        />
      </div>

      <div className="hstack" style={{ gap: 12 }}>
        <Button variant="secondary" onClick={runTest} disabled={!canTest || test.kind === "testing"}>
          <Icon name="link" size={14} />
          {test.kind === "testing" ? "Testing…" : "Test connection"}
        </Button>
        {test.kind === "ok" && (
          <span className="hstack" style={{ color: "var(--ok)", fontSize: 12, fontWeight: 500 }}>
            <Icon name="check" size={14} />
            {test.label}
          </span>
        )}
        {test.kind === "fail" && (
          <span className="hstack" style={{ color: "var(--danger)", fontSize: 12 }}>
            <Icon name="alert" size={14} />
            {test.label}
          </span>
        )}
      </div>

      <div className="info-box info-box-sm">
        <Icon name="alert" size={12} />
        <div className="muted">
          Optional — you can connect Jira later in Settings. If you paste a token
          here, it must validate before the project is created.
        </div>
      </div>
    </div>
  );
}
