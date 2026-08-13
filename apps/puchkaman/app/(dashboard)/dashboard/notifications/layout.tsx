import type { ReactNode } from "react";
import { BellIcon } from "lucide-react";
import { PageHeader, PageShell } from "@realm/design-system";
import { NotificationsNav } from "@realm/notifications/ui";
import { requireAdmin } from "@/lib/auth/guards";

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
