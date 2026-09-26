import { memoryBus } from "@foundry/realtime/server";
import { PAYMENTS_INBOX, TICKETS_INBOX } from "./inbox";

export function publishTicketsInbox(): void {
  memoryBus.publish(TICKETS_INBOX, { type: "message", channel: TICKETS_INBOX });
}

export function publishPaymentsInbox(): void {
  memoryBus.publish(PAYMENTS_INBOX, { type: "message", channel: PAYMENTS_INBOX });
}

export function publishUserRefresh(userPublicId: string): void {
  const channel = `refresh:${userPublicId}`;
  memoryBus.publish(channel, { type: "message", channel });
}
