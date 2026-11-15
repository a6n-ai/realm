"use client";

import type { ReactNode } from "react";
import { ChartColumn, ShieldCheck, Truck, UtensilsCrossed, Users, type LucideIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { GROUP_TONE } from "@/components/ds/area-badge";
import type { GroupIconName, PermissionGroup } from "@/lib/auth/permission-groups";

// Icons are resolved here from their names, so server components only ever pass strings.
const ICONS: Record<GroupIconName, LucideIcon> = { Truck, UtensilsCrossed, Users, ChartColumn, ShieldCheck };

export function GroupHeading({ group, trailing }: { group: PermissionGroup; trailing?: ReactNode }) {
  const Icon = ICONS[group.icon];
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className={cn("flex items-center gap-2 text-sm font-semibold", GROUP_TONE[group.color].text)}>
        <Icon className="size-4" aria-hidden />
        {group.label}
      </h3>
      {trailing}
    </div>
  );
}
