import type { RealtimeEvent } from "@foundry/realtime";
import { runInBackground } from "@foundry/cloud/background";
import { realtimeBus } from "./bus";
import { PAYMENTS_INBOX, TICKETS_INBOX } from "./inbox";
import { notifyChannel } from "./notify";

// Un-awaited: on Workers the remote bus is an HTTP call that must outlive the response.
export function publishLive(channel: string, event: RealtimeEvent): void {
  runInBackground(async () => realtimeBus.publish(channel, event), `publish ${channel}`);
}

export function publishTicketsInbox(): void {
  publishLive(TICKETS_INBOX, { type: "message", channel: TICKETS_INBOX });
}

export function publishPaymentsInbox(): void {
  publishLive(PAYMENTS_INBOX, { type: "message", channel: PAYMENTS_INBOX });
}

/** Personal hub ping — refreshes the user's shell and wakes their notification bell. */
export function publishUserRefresh(userPublicId: string): void {
  const channel = notifyChannel(userPublicId);
  publishLive(channel, { type: "message", channel });
}
