import type { RealtimeEvent } from "@foundry/realtime";
import { runInBackground } from "@/lib/runtime/background";
import { realtimeBus } from "./bus";
import { ANALYTICS_LIVE, PAYMENTS_INBOX, TICKETS_INBOX } from "./inbox";

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

// Call after the write commits: a refresh that lands first would re-read the old rows.
export function publishAnalyticsLive(): void {
  publishLive(ANALYTICS_LIVE, { type: "message", channel: ANALYTICS_LIVE });
}

export function publishUserRefresh(userPublicId: string): void {
  const channel = `refresh:${userPublicId}`;
  publishLive(channel, { type: "message", channel });
}
