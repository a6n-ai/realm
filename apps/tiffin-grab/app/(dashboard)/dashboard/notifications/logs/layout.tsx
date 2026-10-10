import type { ReactNode } from "react";
import { DatedTabNav } from "@/components/filters/dated-tab-nav";

// A route per tab, not client-side Tabs — each keeps its own filter/sort/page
// URL params (both tables use `q`/`page`/`size`/`sort`/`dir` and some
// overlapping facet field names), which would otherwise collide if both
// tables read the same query string at once.
export default function LogsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <DatedTabNav
        ariaLabel="Logs sections"
        tabs={[
          { href: "/dashboard/notifications/logs", label: "Sends" },
          { href: "/dashboard/notifications/logs/activity", label: "Activity" },
          { href: "/dashboard/notifications/logs/suppressed", label: "Suppressed" },
        ]}
      />
      {children}
    </div>
  );
}
