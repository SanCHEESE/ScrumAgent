import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders as a square icon button (`.btn-icon` padding). */
  iconOnly?: boolean;
  children?: ReactNode;
}

/** Wraps the `.btn` CSS classes from base.css. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    iconOnly = false,
    className = "",
    type,
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : "",
    iconOnly ? "btn-icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type ?? "button"} className={classes} {...rest}>
      {children}
    </button>
  );
});
