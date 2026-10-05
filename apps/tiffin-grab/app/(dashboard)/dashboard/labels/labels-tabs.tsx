"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon, PackageOpenIcon, TagIcon, TruckIcon, UtensilsCrossedIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { useListNavPending } from "@/components/ds";
import { LABEL_TABS, type LabelTab } from "./label-tab";

const META: Record<LabelTab, { label: string; icon: typeof TagIcon }> = {
  packing: { label: "Packing sheet", icon: PackageOpenIcon },
  deliveries: { label: "Deliveries", icon: TruckIcon },
  kitchen: { label: "Kitchen counts", icon: UtensilsCrossedIcon },
  labels: { label: "Labels", icon: TagIcon },
};

const isTab = (v: string | null): v is LabelTab => (LABEL_TABS as readonly string[]).includes(v ?? "");

// The server already loads every tab's data for the stats, so switching tabs is a
// pushState (Next syncs useSearchParams) instead of a navigation that re-runs all
// three day loaders. Only ?date= is kept: the next tab starts on page 1 with its
// own default sort and no search left over.
export function LabelsTabs({
  date,
  counts,
  panels,
}: {
  date: string;
  counts: Record<LabelTab, number>;
  panels: Record<LabelTab, ReactNode>;
}) {
  const tabParam = useSearchParams().get("tab");
  const active: LabelTab = isTab(tabParam) ? tabParam : "packing";
  // Sort, page and search still round-trip to the server; say so beyond the table dim.
  const loading = useListNavPending();

  const select = (tab: string) => {
    if (!isTab(tab) || tab === active) return;
    window.history.pushState(null, "", `/dashboard/labels?date=${date}&tab=${tab}`);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Tabs value={active} onValueChange={select}>
          <TabsList variant="line" aria-label="Labels sections" className="h-auto flex-wrap overflow-x-visible">
            {LABEL_TABS.map((tab) => {
              const { label, icon: Icon } = META[tab];
              return (
                <TabsTrigger key={tab} value={tab}>
                  <Icon /> {label}
                  <span className="text-muted-foreground tabular-nums">{counts[tab]}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        {loading ? (
          <span role="status" className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2Icon className="size-3.5 animate-spin" /> Loading…
          </span>
        ) : null}
      </div>
      {panels[active]}
    </>
  );
}
