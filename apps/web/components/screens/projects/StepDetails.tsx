import type { JSX } from "react";
import { COLOR_SWATCHES, type WizardFormData } from "./types";

export interface StepDetailsProps {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
}

export function StepDetails({ data, onChange }: StepDetailsProps): JSX.Element {
  return (
    <div className="vstack">
      <div>
        <label className="label" htmlFor="proj-name">
          Project name
        </label>
        <input
          id="proj-name"
          className="input"
          placeholder="e.g. Platform Team"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="proj-desc">
          Description{" "}
          <span className="muted">(helps the agent set context)</span>
        </label>
        <textarea
          id="proj-desc"
          className="textarea"
          placeholder="What does this team do? Any specific terminology or focus areas?"
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Color</label>
        <div className="color-picker">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pick ${c}`}
              className={`color-swatch ${data.color === c ? "selected" : ""}`}
              style={{ background: c }}
              onClick={() => onChange({ color: c })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
