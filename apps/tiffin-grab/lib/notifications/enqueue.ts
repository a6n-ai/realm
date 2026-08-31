import { enqueue, type EnqueueInput } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event = (typeof notificationTables.notificationOutbox.event.enumValues)[number];
type Channel = (typeof notificationTables.notificationOutbox.channel.enumValues)[number];

/** Default channels per event. Events not listed here fall back to in_app only. */
const EVENT_CHANNELS: Partial<Record<Event, Channel[]>> = {
  order_activated: ["email", "in_app"],
  order_cancelled: ["email", "in_app"],
  menu_released: ["email", "in_app"],
  payment_received: ["email", "in_app"],
  wallet_credited: ["in_app"],
  ticket_reply: ["email", "in_app"],
  inquiry_follow_up: ["in_app"],
};

export type { EnqueueInput };

/** App-side enqueue: applies tiffin-grab's per-event channel defaults. */
export function enqueueNotification(tx: Tx, input: EnqueueInput & { event: Event }): Promise<void> {
  return enqueue(tx, notificationTables, usersRef, {
    ...input,
    channels: input.channels ?? EVENT_CHANNELS[input.event],
  });
}
