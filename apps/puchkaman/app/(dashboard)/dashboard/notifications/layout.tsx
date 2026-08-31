import type { ReactNode } from "react";
import { BellIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { NotificationsNav } from "@relay/engine/ui";
import { requireAdmin } from "@/lib/auth/guards";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader
        icon={BellIcon}
        title="Notifications"
        subtitle="Templates, campaigns, contact lists and delivery logs."
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
