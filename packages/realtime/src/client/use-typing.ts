"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeEvent, RealtimeRole } from "../index";
import { useChannel } from "./use-channel";

// Returns whether a `peerRole` user is currently typing, plus a `notifyTyping()`
// to call on keystrokes. notifyTyping POSTs typing=true (throttled) and schedules
// a typing=false after idle. Peer typing auto-expires so a dropped "stop" frame
// can't leave the indicator stuck.
export function useTyping(channel: string | null, peerRole: RealtimeRole): {
  peerTyping: boolean;
  notifyTyping: () => void;
} {
  const [peerTyping, setPeerTyping] = useState(false);
  const peerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handler = useRef((e: RealtimeEvent) => {
    if (e.type !== "typing" || e.role !== peerRole || !e.typing) return;
    setPeerTyping(true);
    if (peerTimer.current) clearTimeout(peerTimer.current);
    peerTimer.current = setTimeout(() => setPeerTyping(false), 4000);
  });
  handler.current = (e: RealtimeEvent) => {
    if (e.type !== "typing" || e.role !== peerRole) return;
    if (e.typing) {
      setPeerTyping(true);
      if (peerTimer.current) clearTimeout(peerTimer.current);
      peerTimer.current = setTimeout(() => setPeerTyping(false), 4000);
    } else {
      setPeerTyping(false);
    }
  };
  useChannel(channel, (e) => handler.current(e));

  const post = useCallback(
    (typing: boolean) => {
      if (!channel) return;
      void fetch("/api/realtime/typing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, typing }),
        keepalive: true,
      });
    },
    [channel],
  );

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current > 2000) {
      lastSent.current = now;
      post(true);
    }
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => post(false), 3000);
  }, [post]);

  useEffect(() => () => {
    if (peerTimer.current) clearTimeout(peerTimer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
  }, []);

  return { peerTyping, notifyTyping };
}
