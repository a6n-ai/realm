"use client";

import { useRef, useState } from "react";
import type { RealtimeEvent, RealtimeRole } from "../index";
import { useChannel } from "./use-channel";

// True when at least one user of `peerRole` currently holds an open stream on the
// channel — i.e. "the other side is viewing this ticket right now."
export function usePresence(channel: string | null, peerRole: RealtimeRole): boolean {
  const [peers, setPeers] = useState<Set<string>>(new Set());
  const onEvent = useRef((e: RealtimeEvent) => {
    if (e.type !== "presence" || e.role !== peerRole) return;
    setPeers((prev) => {
      const next = new Set(prev);
      if (e.online) next.add(e.userId);
      else next.delete(e.userId);
      return next;
    });
  });
  onEvent.current = (e: RealtimeEvent) => {
    if (e.type !== "presence" || e.role !== peerRole) return;
    setPeers((prev) => {
      const next = new Set(prev);
      if (e.online) next.add(e.userId);
      else next.delete(e.userId);
      return next;
    });
  };
  useChannel(channel, (e) => onEvent.current(e));
  return peers.size > 0;
}
