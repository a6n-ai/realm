"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Badge } from "@/components/reui/badge";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import type { QueueTab } from "@/lib/services/inquiries.service";

const TABS: { value: QueueTab; label: string }[] = [
  { value: "due", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "open", label: "All open" },
  { value: "closed", label: "Closed" },
];

/** Switching tabs keeps the other filters and resets the page. */
export function QueueTabs({ counts }: { counts: Record<QueueTab, number> }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = TABS.find((t) => t.value === sp.get("queue"))?.value ?? "due";
  const href = (tab: QueueTab) => {
    const next = new URLSearchParams(sp.toString());
    next.set("queue", tab);
    next.delete("page");
    return `${pathname}?${next.toString()}`;
  };
  return (
    <Tabs value={current}>
      <TabsList variant="line" aria-label="Follow-up queues">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} asChild className="gap-1.5">
            <Link href={href(t.value)} prefetch={false}>
              {t.label}
              <Badge variant={t.value === "overdue" && counts.overdue > 0 ? "destructive-light" : "secondary"} className="tabular-nums">
                {counts[t.value]}
              </Badge>
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
