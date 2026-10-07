import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBellMount } from "@/components/notifications/notification-bell-mount";
import type { FeedResponse } from "@relay/engine/ui";
import { CoinChip } from "./coin-chip";
import { SupportChip } from "./support-chip";

export function CustomerHeaderActions({
  coinBalance,
  userPublicId,
  notificationFeed,
}: {
  coinBalance: number | string;
  userPublicId: string;
  notificationFeed?: FeedResponse;
}) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <CoinChip balance={coinBalance} />
      <SupportChip />
      <NotificationBellMount userPublicId={userPublicId} initial={notificationFeed} />
      <ModeToggle />
    </div>
  );
}
