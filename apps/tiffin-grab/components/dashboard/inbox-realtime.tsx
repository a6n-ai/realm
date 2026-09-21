"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useChannel } from "@foundry/realtime/client";
import type { RealtimeEvent } from "@foundry/realtime";
import { PAYMENTS_INBOX, TICKETS_INBOX } from "@/lib/realtime/inbox";

/**
 * Staff dashboard: one SSE stream per inbox channel. A `message` ping means
 * something new landed in the DB — refresh the RSC tree so section-seen dots
 * and list pages update without polling. Same transport as ticket chat.
 */
function useInboxRefresh(channel: string | null): void {
  const router = useRouter();
  const onEvent = useRef((e: RealtimeEvent) => {
    if (e.type === "message") router.refresh();
  });
  onEvent.current = (e: RealtimeEvent) => {
    if (e.type === "message") router.refresh();
  };
  useChannel(channel, (e) => onEvent.current(e));
}

export function InboxRealtime({
  tickets = true,
  payments = false,
}: {
  tickets?: boolean;
  payments?: boolean;
}) {
  useInboxRefresh(tickets ? TICKETS_INBOX : null);
  useInboxRefresh(payments ? PAYMENTS_INBOX : null);
  return null;
}
