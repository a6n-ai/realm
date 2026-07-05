import type { ReactNode } from "react";
import { BellIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { NotificationsNav } from "@/components/notifications/notifications-nav";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader
        icon={BellIcon}
        title="Notifications"
        subtitle="Templates, delivery logs, and analytics."
      />
      <NotificationsNav />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
