"use client";
import { useEffect, useState } from "react";

// Per-device read state for support tickets: ticket publicId → when the customer last opened it.
// ponytail: localStorage, so "seen" doesn't follow the customer across devices; move to a
// server-side read marker (needs a section_seen enum value) if that matters.
const KEY = "tg.support.seen";
const EVENT = "tg-support-seen";

function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** Tickets with a staff reply newer than the customer's last look. */
export function unreadCount(replies: Record<string, number>, seen: Record<string, number>): number {
  return Object.entries(replies).filter(([id, at]) => at > (seen[id] ?? 0)).length;
}

export function useSupportUnread(replies: Record<string, number>): number {
  const [seen, setSeen] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    const sync = () => setSeen(readSeen());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => (window.removeEventListener(EVENT, sync), window.removeEventListener("storage", sync));
  }, []);
  // Before the browser read (SSR / first paint) show nothing rather than a false badge.
  return seen ? unreadCount(replies, seen) : 0;
}

/** Call while a ticket is open: marks everything in it as seen. */
export function useMarkTicketSeen(ticketId: string, latestAt: number) {
  useEffect(() => {
    try {
      const seen = readSeen();
      if ((seen[ticketId] ?? 0) >= latestAt) return;
      seen[ticketId] = Math.max(latestAt, Date.now());
      localStorage.setItem(KEY, JSON.stringify(seen));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* storage blocked: the badge just stays until the customer replies */
    }
  }, [ticketId, latestAt]);
}
