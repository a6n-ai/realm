import { memoryBus } from "@foundry/realtime/server";
import { ANALYTICS_LIVE, PAYMENTS_INBOX, TICKETS_INBOX } from "./inbox";

export function publishTicketsInbox(): void {
  memoryBus.publish(TICKETS_INBOX, { type: "message", channel: TICKETS_INBOX });
}

export function publishPaymentsInbox(): void {
  memoryBus.publish(PAYMENTS_INBOX, { type: "message", channel: PAYMENTS_INBOX });
}

// Call after the write commits: a refresh that lands first would re-read the old rows.
export function publishAnalyticsLive(): void {
  memoryBus.publish(ANALYTICS_LIVE, { type: "message", channel: ANALYTICS_LIVE });
}

export function publishUserRefresh(userPublicId: string): void {
  const channel = `refresh:${userPublicId}`;
  memoryBus.publish(channel, { type: "message", channel });
}
