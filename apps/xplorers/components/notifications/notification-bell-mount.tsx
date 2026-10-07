"use client";

import { useMemo } from "react";
import type { FeedResponse } from "@relay/engine/ui";
import { NotificationBell } from "./notification-bell";
import { makeSubscriber } from "./realtime";

export function NotificationBellMount({
  userPublicId,
  initial,
}: {
  userPublicId: string;
  initial?: FeedResponse;
}) {
  const subscribe = useMemo(() => makeSubscriber(userPublicId), [userPublicId]);
  return <NotificationBell subscribe={subscribe} initial={initial} />;
}
