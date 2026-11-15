"use client";

import { Badge } from "@/components/reui/badge";
import { groupOfResource, type GroupColor } from "@/lib/auth/permission-groups";

// Categorical identity, not status: raw palette with a dark pair, so it never reads as ok/warn/bad.
export const GROUP_TONE: Record<GroupColor, { badge: string; text: string }> = {
  blue: { badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300", text: "text-blue-700 dark:text-blue-300" },
  amber: { badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300", text: "text-amber-700 dark:text-amber-300" },
  violet: { badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300", text: "text-violet-700 dark:text-violet-300" },
  emerald: { badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-300" },
  slate: { badge: "bg-slate-500/10 text-slate-700 dark:text-slate-300", text: "text-slate-700 dark:text-slate-300" },
};

/** An area (resource) tinted with its group's color. */
export function AreaBadge({ resource, label }: { resource: string; label: string }) {
  return <Badge variant="secondary" className={GROUP_TONE[groupOfResource(resource).color].badge}>{label}</Badge>;
}
