import { NotificationsSection } from "@/components/account/sections/notifications-section";
import { requireSectionAccess } from "../current-user";

export default async function AccountNotificationsPage() {
  const { user } = await requireSectionAccess("notifications");
  return (
    <NotificationsSection
      notifyEmail={user.notifyEmail ?? true}
      notifySms={user.notifySms ?? false}
    />
  );
}
