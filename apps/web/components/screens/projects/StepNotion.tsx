"use client";

import { useState, type JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ApiError, api } from "@/lib/api";
import type { WizardFormData } from "./types";

export interface StepNotionProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; label: string }
  | { kind: "fail"; label: string };

export function StepNotion({ data, onChange }: StepNotionProps): JSX.Element {
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const result = await api.testNotion(data.notionToken);
      setTest(
        result.ok
          ? { kind: "ok", label: "Connected" }
          : { kind: "fail", label: result.error ?? "Invalid token" },
      );
    } catch (e) {
      setTest({
        kind: "fail",
        label: e instanceof ApiError ? e.message : "Request failed",
      });
    }
  };

  const update = (patch: Partial<WizardFormData>) => {
    if (test.kind !== "idle") setTest({ kind: "idle" });
    onChange(patch);
  };

  return (
    <div className="vstack">
      <div>
        <label className="label" htmlFor="notion-token">
          Integration token
        </label>
        <input
          id="notion-token"
          className="input"
          type="password"
          placeholder="Paste a working Notion integration token"
          value={data.notionToken}
          onChange={(e) => update({ notionToken: e.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="notion-section">
          Link to the Notion section
        </label>
        <input
          id="notion-section"
          className="input"
          placeholder="https://www.notion.so/municorn/Sprint-Notes-1a2b3c…"
          value={data.notionSectionUrl}
          onChange={(e) => update({ notionSectionUrl: e.target.value })}
        />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Paste the link to the page/section where the agent should write meeting
          notes. The page id is parsed from this link.
        </div>
      </div>

      <div className="hstack" style={{ gap: 12 }}>
        <Button
          variant="secondary"
          onClick={runTest}
          disabled={data.notionToken.trim() === "" || test.kind === "testing"}
        >
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
        <Icon name="sparkles" size={12} />
        <div className="muted">
          Optional — connect Notion later in Settings. A pasted token must
          validate before the project is created.
        </div>
      </div>
    </div>
  );
}
