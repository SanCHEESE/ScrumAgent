import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";

/**
 * Layout for routes that show the live bar + sidebar + main grid.
 * Pages inside `app/(shell)/` inherit this. Auth-style pages (e.g. /login)
 * live outside the group and skip the shell.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
