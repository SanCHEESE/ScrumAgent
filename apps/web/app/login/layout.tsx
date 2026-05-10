import type { ReactNode } from "react";

/**
 * Login layout — intentionally bypasses the AppShell.
 * Placed outside the `(shell)` route group so the live bar + sidebar do not render.
 *
 * Note: the global `body { overflow: hidden }` rule keeps the shell from
 * scrolling vertically, which works because the shell is grid-sized to
 * `100vh`. If the login screen ever needs to scroll, toggle `body.no-shell`
 * (defined in styles/base.css) inside the page component.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
