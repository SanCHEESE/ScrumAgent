import type { JSX } from "react";
import type { Participant } from "@/lib/types";

export interface AvatarProps {
  participant: Participant;
  size?: number;
}

/** Round avatar with participant initials. Ported from kabanchik-ui.jsx. */
export function Avatar({ participant, size = 28 }: AvatarProps): JSX.Element {
  return (
    <div
      className="avatar"
      style={{
        background: participant.color,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {participant.initials}
    </div>
  );
}
