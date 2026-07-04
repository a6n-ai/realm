import { Suspense } from "react";
import { NotificationsSection } from "@/components/account/sections/notifications-section";
import { NotificationsSectionSkeleton } from "./notifications-section-skeleton";
import { requireSectionAccess } from "../current-user";

export default function AccountNotificationsPage() {
  return (
    <Suspense fallback={<NotificationsSectionSkeleton />}>
      <NotificationsData />
    </Suspense>
  );
}

async function NotificationsData() {
  const { user } = await requireSectionAccess("notifications");
  return (
    <NotificationsSection
      notifyEmail={user.notifyEmail ?? true}
      notifySms={user.notifySms ?? false}
    />
  );
}
