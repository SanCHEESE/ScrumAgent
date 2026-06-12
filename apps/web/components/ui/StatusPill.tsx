import type { JSX } from "react";

/**
 * Statuses recognised by the prototype StatusPill.
 * Unknown values render with a neutral pill and the raw label.
 */
export type StatusKey =
  | "done"
  | "analyzing"
  | "transcribing"
  | "error"
  | "pending"
  | "approved"
  | "rejected"
  | "applied"
  | "processing"
  | (string & {});

interface PillSpec {
  cls: string;
  label: string;
  dot?: boolean;
}

const STATUS_MAP: Record<string, PillSpec> = {
  done: { cls: "badge-paid", label: "Done" },
  active: { cls: "badge-paid", label: "Active" },
  analyzing: { cls: "badge-brand", label: "Analyzing", dot: true },
  transcribing: { cls: "badge-draft", label: "Transcribing", dot: true },
  error: { cls: "badge-overdue", label: "Error" },
  pending: { cls: "badge-unpaid", label: "Pending" },
  approved: { cls: "badge-paid", label: "Approved" },
  rejected: { cls: "badge-neutral", label: "Rejected" },
  applied: { cls: "badge-paid", label: "Applied" },
  processing: { cls: "badge-unpaid", label: "In progress" },
  scheduled: { cls: "badge-brand", label: "Scheduled" },
  past: { cls: "badge-neutral", label: "Past" },
};

export interface StatusPillProps {
  status: StatusKey;
}

export function StatusPill({ status }: StatusPillProps): JSX.Element {
  const m = STATUS_MAP[status] ?? { cls: "badge-neutral", label: String(status) };
  return (
    <span className={`badge ${m.cls}`}>
      {m.dot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.7,
          }}
        />
      )}
      {m.label}
    </span>
  );
}
