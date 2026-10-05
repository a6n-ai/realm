"use client";

import Link from "next/link";
import { PackageOpenIcon, TagIcon, TruckIcon, UtensilsCrossedIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { LABEL_TABS, type LabelTab } from "./label-tab";

const META: Record<LabelTab, { label: string; icon: typeof TagIcon }> = {
  packing: { label: "Packing sheet", icon: PackageOpenIcon },
  deliveries: { label: "Deliveries", icon: TruckIcon },
  kitchen: { label: "Kitchen counts", icon: UtensilsCrossedIcon },
  labels: { label: "Labels", icon: TagIcon },
};

// Links carry only ?date= so the next tab starts on page 1 with its own default sort
// and no search left over from the previous list.
export function LabelsTabs({
  date,
  active,
  counts,
}: {
  date: string;
  active: LabelTab;
  counts: Record<LabelTab, number>;
}) {
  return (
    <Tabs value={active}>
      <TabsList variant="line" aria-label="Labels sections" className="h-auto flex-wrap overflow-x-visible">
        {LABEL_TABS.map((tab) => {
          const { label, icon: Icon } = META[tab];
          return (
            <TabsTrigger key={tab} value={tab} asChild>
              <Link href={`/dashboard/labels?date=${date}&tab=${tab}`} prefetch={false} scroll={false}>
                <Icon /> {label}
                <span className="text-muted-foreground tabular-nums">{counts[tab]}</span>
              </Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
