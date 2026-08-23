import type { ReactNode } from "react";
import { BellIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { NotificationsNav } from "@realm/notifications/ui";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader
        icon={BellIcon}
        title="Notifications"
        subtitle="Templates, delivery logs, and analytics."
      />
      <NotificationsNav
        tabs={[
          { href: "/dashboard/notifications/templates", label: "Templates" },
          { href: "/dashboard/notifications/campaigns", label: "Campaigns" },
          { href: "/dashboard/notifications/contact-lists", label: "Contact lists" },
          { href: "/dashboard/notifications/emails", label: "Emails" },
          { href: "/dashboard/notifications/logs", label: "Logs" },
          { href: "/dashboard/notifications/analytics", label: "Analytics" },
        ]}
      />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
