"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StepDetails } from "./StepDetails";
import { StepGoogle } from "./StepGoogle";
import { StepInvite } from "./StepInvite";
import { StepJira } from "./StepJira";
import { StepNotion } from "./StepNotion";
import { WizardSteps, type WizardStep } from "./WizardSteps";
import { INITIAL_FORM, type WizardFormData } from "./types";

const STEPS: readonly WizardStep[] = [
  { key: "details", label: "Details" },
  { key: "google", label: "Google Workspace" },
  { key: "jira", label: "Jira" },
  { key: "notion", label: "Notion" },
  { key: "invite", label: "Invite team" },
];

export function AddProjectWizard(): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardFormData>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);

  const update = (patch: Partial<WizardFormData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const onCreate = () => {
    setCreating(true);
    // Mock provisioning. In real life this would POST to the backend.
    window.setTimeout(() => {
      router.push("/projects?created=1");
    }, 600);
  };

  const isLast = step === STEPS.length - 1;
  const canContinue = step !== 0 || data.name.trim().length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Add project</h1>
          <div className="page-subtitle">
            5 steps to wire up a new team. Each project bundles a Google
            Workspace account with Jira and Notion.
          </div>
        </div>
        <Link
          href="/projects"
          className="btn btn-ghost"
          aria-label="Cancel and return to projects"
        >
          <Icon name="close" size={14} />
          Cancel
        </Link>
      </div>

      <div className="wizard-page-card">
        <WizardSteps steps={STEPS} current={step} />

        <div className="wizard-page-body">
          {step === 0 && <StepDetails data={data} onChange={update} />}
          {step === 1 && <StepGoogle data={data} onChange={update} />}
          {step === 2 && <StepJira data={data} onChange={update} />}
          {step === 3 && <StepNotion data={data} onChange={update} />}
          {step === 4 && <StepInvite data={data} onChange={update} />}
        </div>

        <div className="wizard-page-footer">
          <Button variant="secondary" onClick={prev} disabled={step === 0}>
            Back
          </Button>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>
            Step {step + 1} of {STEPS.length}
          </span>
          {isLast ? (
            <Button
              variant="primary"
              onClick={onCreate}
              disabled={creating || !canContinue}
            >
              <Icon name="sparkles" size={14} />
              {creating ? "Creating…" : "Create project"}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={next}
              disabled={!canContinue}
            >
              Continue
              <Icon name="arrow_right" size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
