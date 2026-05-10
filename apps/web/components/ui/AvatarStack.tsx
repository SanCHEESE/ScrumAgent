import type { JSX } from "react";
import { PARTICIPANTS } from "@/lib/mock-data";
import type { ParticipantId } from "@/lib/types";
import { Avatar } from "./Avatar";

export interface AvatarStackProps {
  ids: ParticipantId[];
  max?: number;
}

/** Overlapping avatar row with a "+N" overflow chip. Ported from kabanchik-ui.jsx. */
export function AvatarStack({ ids, max = 4 }: AvatarStackProps): JSX.Element {
  const keys = ids.slice(0, max);
  const extra = ids.length - keys.length;
  return (
    <div className="avatar-stack">
      {keys.map((k) => {
        const p = PARTICIPANTS[k];
        if (!p) return null;
        return <Avatar key={k} participant={p} size={26} />;
      })}
      {extra > 0 && (
        <div
          className="avatar"
          style={{
            background: "var(--bg-2)",
            color: "var(--ink-2)",
            width: 26,
            height: 26,
            fontSize: 10,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
