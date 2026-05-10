import type { HTMLAttributes, JSX, ReactNode } from "react";

export type BadgeVariant =
  | "paid"
  | "unpaid"
  | "overdue"
  | "draft"
  | "neutral"
  | "brand";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children?: ReactNode;
}

/**
 * Tone-only chip. Maps to the .badge-* CSS classes from base.css.
 * For status semantics, use {@link StatusPill}.
 */
export function Badge({
  variant = "neutral",
  className = "",
  children,
  ...rest
}: BadgeProps): JSX.Element {
  return (
    <span className={`badge badge-${variant} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
