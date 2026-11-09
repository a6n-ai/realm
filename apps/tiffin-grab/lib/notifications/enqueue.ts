import { STAFF_ROLES } from "@/lib/auth/roles";
import { enqueue, enqueueToRole, type EnqueueInput, type EnqueueToRoleInput } from "@relay/engine";
import { db, type Tx } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { markOutboxDirty } from "./outbox-dirty";
import { EVENTS, type AppEvent } from "./events";

type Event = AppEvent;

export type { EnqueueInput };

/**
 * App-side enqueue: applies the per-event channel defaults from EVENTS, then flags
 * the outbox; db.transaction signals the consumer once the transaction commits.
 */
export async function enqueueNotification(tx: Tx, input: EnqueueInput & { event: Event }): Promise<void> {
  await enqueue(tx, notificationTables, usersRef, {
    ...input,
    channels: input.channels ?? EVENTS[input.event].channels,
  });
  markOutboxDirty();
}

/** Staff-facing fan-out: one in-app row per active admin/member. */
export async function enqueueStaffNotification(tx: Tx, input: Omit<EnqueueToRoleInput, "roles" | "event"> & { event?: Event }): Promise<void> {
  await enqueueToRole(tx, notificationTables, usersRef, {
    ...input,
    roles: STAFF_ROLES,
    channels: input.channels ?? (input.event ? EVENTS[input.event].channels : undefined),
  });
  markOutboxDirty();
}
