import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import type { TraceToolCall as TraceToolCallModel } from "@/lib/types";
import { JsonBlock } from "./JsonBlock";

export interface TraceToolCallProps {
  tool: TraceToolCallModel;
}

/**
 * One nested tool invocation: function name, JSON args, JSON result.
 */
export function TraceToolCall({ tool }: TraceToolCallProps): JSX.Element {
  return (
    <div className="trace-tool-call">
      <div className="trace-tool-call-name">
        <Icon name="play" size={11} />
        <span>{tool.name}</span>
      </div>
      <div className="trace-tool-call-section">
        <span className="trace-tool-call-label">Args</span>
        <JsonBlock raw={tool.args} variant="input" collapseAt={140} />
      </div>
      <div className="trace-tool-call-section">
        <span className="trace-tool-call-label">Result</span>
        <JsonBlock raw={tool.result} variant="output" collapseAt={140} />
      </div>
    </div>
  );
}
