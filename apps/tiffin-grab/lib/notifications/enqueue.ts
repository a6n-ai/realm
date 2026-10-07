import { enqueue, enqueueToRole, type EnqueueInput, type EnqueueToRoleInput } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { signalOutbox } from "./outbox-signal";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event = (typeof notificationTables.notificationOutbox.event.enumValues)[number];
type Channel = (typeof notificationTables.notificationOutbox.channel.enumValues)[number];

/** Default channels per event. Events not listed here fall back to in_app only. */
const EVENT_CHANNELS: Partial<Record<Event, Channel[]>> = {
  order_activated: ["email", "in_app"],
  order_cancelled: ["email", "in_app"],
  order_complimentary: ["email", "in_app"],
  menu_released: ["email", "in_app"],
  payment_received: ["email", "in_app"],
  payment_approved: ["email", "in_app"],
  wallet_credited: ["in_app"],
  ticket_reply: ["email", "in_app"],
  inquiry_follow_up: ["in_app"],
  review_nudge: ["email"],
  staff_invitation: ["email"],
  customer_invitation: ["email"],
  payment_reminder: ["email"],
};

export type { EnqueueInput };

/**
 * App-side enqueue: applies tiffin-grab's per-event channel defaults, then wakes
 * the outbox listener. The signal lands before the caller's transaction commits;
 * the listener's settle delay covers that.
 */
export async function enqueueNotification(tx: Tx, input: EnqueueInput & { event: Event }): Promise<void> {
  await enqueue(tx, notificationTables, usersRef, {
    ...input,
    channels: input.channels ?? EVENT_CHANNELS[input.event],
  });
  signalOutbox();
}

/** Staff-facing fan-out: one in-app row per active admin/member. */
export async function enqueueStaffNotification(tx: Tx, input: Omit<EnqueueToRoleInput, "roles" | "event"> & { event?: Event }): Promise<void> {
  await enqueueToRole(tx, notificationTables, usersRef, {
    ...input,
    roles: ["admin", "member"],
    channels: input.channels ?? (input.event ? EVENT_CHANNELS[input.event] : undefined),
  });
  signalOutbox();
}
