import type { ReactNode } from "react";
import { can } from "@/lib/auth/guards";

/** Renders children only when the caller's org role holds `perms`. Load a section's data inside its children, not above. */
export async function Can({ perms, children, fallback = null }: { perms: Record<string, string[]>; children: ReactNode; fallback?: ReactNode }) {
  return (await can(perms)) ? children : fallback;
}

export function NoAccessNote() {
  return <p className="text-muted-foreground text-xs">You don&apos;t have access to this section.</p>;
}
