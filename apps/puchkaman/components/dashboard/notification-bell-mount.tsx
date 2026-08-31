"use client";

import { useMemo } from "react";
import { NotificationBell } from "@relay/engine/ui";
import { makeSubscriber } from "@/components/notifications/realtime";

/**
 * Bridges the server layout to the client bell: the subscriber is a closure
 * over the user's public id, which cannot cross the server/client boundary as
 * a function prop.
 */
export function NotificationBellMount({ userPublicId }: { userPublicId: string }) {
  const subscribe = useMemo(() => makeSubscriber(userPublicId), [userPublicId]);
  return <NotificationBell subscribe={subscribe} />;
}
