import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import type { TraceStep } from "@/lib/types";
import { JsonBlock } from "./JsonBlock";
import { TraceToolCall } from "./TraceToolCall";

export interface TraceStepRowProps {
  step: TraceStep;
}

/**
 * Picks a reasonable icon for a step based on its name.
 *
 * The lookup is intentionally string-based — step names come from mock data
 * and there is no enum to switch over. Falls back to `sparkles`.
 */
function pickStepIcon(stepName: string): IconName {
  const n = stepName.toLowerCase();
  if (n.includes("fetch")) return "search";
  if (n.includes("analyze")) return "sparkles";
  if (n.includes("extract")) return "sparkles";
  if (n.includes("handoff") || n.includes("→")) return "arrow_right";
  if (n.includes("propose")) return "edit";
  if (n.includes("save")) return "check";
  return "sparkles";
}

/**
 * Single row in the run timeline: icon, name + agent + duration, then
 * input/output JSON and any nested tool calls.
 */
export function TraceStepRow({ step }: TraceStepRowProps): JSX.Element {
  const iconName = pickStepIcon(step.name);

  return (
    <div className="trace-step">
      <div className="trace-step-icon" data-agent={step.agent}>
        <Icon name={iconName} size={14} />
      </div>
      <div className="trace-step-body">
        <div className="trace-step-meta">
          <span className="trace-step-name">{step.name}</span>
          <span className="trace-step-agent">[{step.agent}]</span>
          <span className="trace-step-duration">{step.duration}</span>
        </div>

        <div className="trace-step-section">
          <span className="trace-step-section-label">Input</span>
          <JsonBlock raw={step.input} variant="input" />
        </div>

        <div className="trace-step-section">
          <span className="trace-step-section-label">Output</span>
          <JsonBlock raw={step.output} variant="output" />
        </div>

        {step.tools.length > 0 && (
          <div className="trace-step-section">
            <span className="trace-step-section-label">
              Tool calls ({step.tools.length})
            </span>
            <div className="trace-step-tools">
              {step.tools.map((tool, i) => (
                <TraceToolCall key={`${tool.name}-${i}`} tool={tool} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
