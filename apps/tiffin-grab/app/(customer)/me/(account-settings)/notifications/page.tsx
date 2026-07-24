import { Suspense } from "react";
import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { NotificationsSection } from "@/components/account/sections/notifications-section";
import { NotificationsSectionSkeleton } from "@/app/(dashboard)/dashboard/account/notifications/notifications-section-skeleton";

export default function MeNotificationsPage() {
  return (
    <Suspense fallback={<NotificationsSectionSkeleton />}>
      <NotificationsData />
    </Suspense>
  );
}

async function NotificationsData() {
  const { user } = await requireAccountUser();
  return (
    <NotificationsSection
      notifyEmail={user.notifyEmail ?? true}
      notifySms={user.notifySms ?? false}
    />
  );
}
