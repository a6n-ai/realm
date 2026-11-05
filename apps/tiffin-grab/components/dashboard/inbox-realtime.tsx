/* eslint-disable */
"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useChannel } from "@foundry/realtime/client";
import type { RealtimeEvent } from "@foundry/realtime";
import type { RealtimeBootstrap } from "@/components/notifications/realtime";
import { PAYMENTS_INBOX, TICKETS_INBOX } from "@/lib/realtime/inbox";

/**
 * Staff dashboard: one stream per inbox channel. A `message` ping means
 * something new landed in the DB — refresh the RSC tree so section-seen dots
 * and list pages update without polling. Same transport as ticket chat.
 */
function useInboxRefresh(channel: string | null, bootstrap?: RealtimeBootstrap): void {
  const router = useRouter();
  const onEvent = useRef((e: RealtimeEvent) => {
    if (e.type === "message") router.refresh();
  });
  onEvent.current = (e: RealtimeEvent) => {
    if (e.type === "message") router.refresh();
  };
  useChannel(channel, (e) => onEvent.current(e), bootstrap ? { bootstrap } : undefined);
}

export function InboxRealtime({
  tickets = true,
  payments = false,
  ticketsBootstrap,
  paymentsBootstrap,
}: {
  tickets?: boolean;
  payments?: boolean;
  ticketsBootstrap?: RealtimeBootstrap;
  paymentsBootstrap?: RealtimeBootstrap;
}) {
  useInboxRefresh(tickets ? TICKETS_INBOX : null, ticketsBootstrap);
  useInboxRefresh(payments ? PAYMENTS_INBOX : null, paymentsBootstrap);
  return null;
}
