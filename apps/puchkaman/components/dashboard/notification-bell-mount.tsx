"use client";

import { useMemo } from "react";
import { NotificationBell, type FeedResponse } from "@relay/engine/ui";
import { makeSubscriber } from "@/components/notifications/realtime";

/**
 * Bridges the server layout to the client bell: the subscriber is a closure
 * over the user's public id, which cannot cross the server/client boundary as
 * a function prop.
 */
export function NotificationBellMount({ userPublicId, initial }: { userPublicId: string; initial?: FeedResponse }) {
  const subscribe = useMemo(() => makeSubscriber(userPublicId), [userPublicId]);
  return <NotificationBell subscribe={subscribe} initial={initial} />;
}
