"use client";

import { Badge } from "@/components/reui/badge";
import { groupOfResource, type GroupColor } from "@/lib/auth/permission-groups";

// Categorical identity, not status: raw palette with a dark pair, so it never reads as ok/warn/bad.
export const GROUP_TONE: Record<GroupColor, { badge: string; text: string }> = {
  teal: { badge: "[--ui-badge-tone:var(--color-teal-700)] dark:[--ui-badge-tone:var(--color-teal-300)]", text: "text-teal-700 dark:text-teal-300" },
  amber: { badge: "[--ui-badge-tone:var(--color-amber-700)] dark:[--ui-badge-tone:var(--color-amber-300)]", text: "text-amber-700 dark:text-amber-300" },
  violet: { badge: "[--ui-badge-tone:var(--color-violet-700)] dark:[--ui-badge-tone:var(--color-violet-300)]", text: "text-violet-700 dark:text-violet-300" },
  emerald: { badge: "[--ui-badge-tone:var(--color-emerald-700)] dark:[--ui-badge-tone:var(--color-emerald-300)]", text: "text-emerald-700 dark:text-emerald-300" },
  slate: { badge: "[--ui-badge-tone:var(--color-slate-700)] dark:[--ui-badge-tone:var(--color-slate-300)]", text: "text-slate-700 dark:text-slate-300" },
};

/** An area (resource) tinted with its group's color. */
export function AreaBadge({ resource, label }: { resource: string; label: string }) {
  return <Badge variant="secondary" className={GROUP_TONE[groupOfResource(resource).color].badge}>{label}</Badge>;
}
