import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";

export interface WizardStep {
  key: string;
  label: string;
}

export interface WizardStepsProps {
  steps: readonly WizardStep[];
  /** Zero-based active step index. */
  current: number;
}

/**
 * Top step indicator. Renders the `.wizard-progress` row plus a thin
 * progress bar showing % completion below.
 */
export function WizardSteps({
  steps,
  current,
}: WizardStepsProps): JSX.Element {
  const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0;
  return (
    <>
      <div className="wizard-progress">
        {steps.map((s, i) => {
          const cls = [
            "wizard-progress-step",
            i < current ? "done" : "",
            i === current ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={s.key} className={cls}>
              <div className="wps-dot">
                {i < current ? <Icon name="check" size={12} /> : i + 1}
              </div>
              <div className="wps-label">{s.label}</div>
            </div>
          );
        })}
      </div>
      <div className="wizard-progress-bar">
        <div
          className="wizard-progress-bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </>
  );
}
