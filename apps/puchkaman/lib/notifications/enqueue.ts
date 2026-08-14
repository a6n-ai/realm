import {
  enqueue,
  enqueueToRole,
  type EnqueueInput,
  type EnqueueToRoleInput,
} from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event = (typeof notificationTables.notificationOutbox.event.enumValues)[number];
type Channel = (typeof notificationTables.notificationOutbox.channel.enumValues)[number];

/**
 * Default channels per event. Customer-facing events stay email-only. Customers
 * can now sign in and /me could render an in-app feed, so this is a deliberate
 * choice rather than a limitation: email is the channel a customer actually
 * checks after ordering. Adding "in_app" here is the follow-up when /me grows a
 * notification surface.
 */
const EVENT_CHANNELS: Partial<Record<Event, Channel[]>> = {
  order_placed: ["email"],
  order_paid: ["email"],
  order_fulfilled: ["email"],
  order_cancelled: ["email"],
  refund_issued: ["email"],
};

/** Staff-facing events go to the in-app feed of every active admin/member. */
const STAFF_CHANNELS: Channel[] = ["in_app"];
const STAFF_ROLES = ["admin", "member"];

export function enqueueNotification(tx: Tx, input: EnqueueInput & { event: Event }): Promise<void> {
  return enqueue(tx, notificationTables, usersRef, {
    ...input,
    channels: input.channels ?? EVENT_CHANNELS[input.event] ?? ["email"],
  });
}

export function enqueueStaff(
  tx: Tx,
  input: Omit<EnqueueToRoleInput, "roles"> & { event: Event },
): Promise<void> {
  return enqueueToRole(tx, notificationTables, usersRef, {
    ...input,
    roles: STAFF_ROLES,
    channels: input.channels ?? STAFF_CHANNELS,
  });
}
