"use client";

import { useMemo } from "react";
import type { FeedResponse } from "@relay/engine/ui/use-notifications";
import type { RealtimeBootstrap } from "@/components/notifications/realtime";
import { makeSubscriber } from "@/components/notifications/realtime";
import { NotificationBell } from "@/components/dashboard/notification-bell";

// The subscriber closes over the user's public id, which cannot cross the server/client
// boundary as a function prop. Local NotificationBell (not Relay's) — Relay scrolls with
// Radix ScrollArea whose viewport child is `display: table`, so max-h never clips and
// rows paint over the page underneath.
export function NotificationBellMount({
  userPublicId,
  initial,
  bootstrap,
}: {
  userPublicId: string;
  initial?: FeedResponse;
  bootstrap?: RealtimeBootstrap;
}) {
  const subscribe = useMemo(
    () => makeSubscriber(userPublicId, bootstrap),
    [userPublicId, bootstrap?.url, bootstrap?.token],
  );
  return <NotificationBell subscribe={subscribe} initial={initial} />;
}
