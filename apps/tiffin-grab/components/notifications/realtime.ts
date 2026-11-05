"use client";

import {
  openChannel,
  type OpenChannelOptions,
  type RealtimeBootstrap,
} from "@foundry/realtime/client";
import type { RealtimeEvent } from "@foundry/realtime";
import type { RealtimeNotification } from "@relay/engine/ui/use-notifications";
import { notifyChannel } from "@/lib/realtime/notify";

export type { RealtimeNotification, RealtimeBootstrap };

type Hub = {
  listeners: Set<(e: RealtimeEvent) => void>;
  close: () => void;
};

/** One WebSocket per channel per tab — bell + shell share `notify:<user>`. */
const hubs = new Map<string, Hub>();

export function subscribeChannel(
  channel: string,
  onEvent: (e: RealtimeEvent) => void,
  opts?: OpenChannelOptions,
): () => void {
  let hub = hubs.get(channel);
  if (!hub) {
    const listeners = new Set<(e: RealtimeEvent) => void>();
    const close = openChannel(
      channel,
      (e) => {
        for (const listener of listeners) listener(e);
      },
      opts,
    );
    hub = { listeners, close };
    hubs.set(channel, hub);
  }
  hub.listeners.add(onEvent);
  return () => {
    hub!.listeners.delete(onEvent);
    if (hub!.listeners.size === 0) {
      hub!.close();
      hubs.delete(channel);
    }
  };
}

/**
 * Bell transport: shared personal hub on `notify:<user>`.
 * The frame carries no payload, so this calls back with nothing and the bell refetches its feed.
 */
export function makeSubscriber(userPublicId: string, bootstrap?: RealtimeBootstrap) {
  const channel = notifyChannel(userPublicId);
  return async (onEvent: (n?: RealtimeNotification) => void): Promise<() => void> =>
    subscribeChannel(
      channel,
      (e) => {
        if (e.type === "message") onEvent();
      },
      bootstrap ? { bootstrap } : undefined,
    );
}
