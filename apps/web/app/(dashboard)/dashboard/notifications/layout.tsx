import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { NotificationsNav } from "@/components/notifications/notifications-nav";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-balance">Notifications</h1>
        <p className="text-muted-foreground">Templates, delivery logs, and analytics.</p>
      </div>
      <NotificationsNav />
      {children}
    </div>
  );
}
