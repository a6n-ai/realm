import type { ReactNode } from "react";
import { BellIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { DatedTabNav } from "@/components/filters/dated-tab-nav";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader
        icon={BellIcon}
        title="Notifications"
        subtitle="Templates, delivery logs, and analytics."
      />
      <DatedTabNav
        ariaLabel="Notifications sections"
        tabs={[
          { href: "/dashboard/notifications/templates", label: "Templates" },
          { href: "/dashboard/notifications/campaigns", label: "Campaigns" },
          { href: "/dashboard/notifications/contact-lists", label: "Contact lists" },
          { href: "/dashboard/notifications/logs", label: "Logs" },
          { href: "/dashboard/notifications/analytics", label: "Analytics" },
        ]}
      />
      <SectionDateRange />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
