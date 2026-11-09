import { and, eq, exists, inArray, or } from "drizzle-orm";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { enqueue, enqueueMany, type EnqueueInput } from "@relay/engine";
import type { Tx } from "@/db/client";
import { member, users } from "@/db/schema";
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

type StaffInput = Omit<EnqueueInput, "recipientId" | "recipientEmail" | "recipientPhone" | "event"> & {
  event?: Event;
  /** The record's franchise: only its members (and platform super-admins) are told. null = all staff. */
  organizationId: string | null;
};

/**
 * Staff-facing fan-out: one row per active admin/member who may see the record, the same rule
 * as resolveSessionVisibleOrgIds, so a franchise never reads another franchise's tickets or leads.
 */
export async function enqueueStaffNotification(tx: Tx, input: StaffInput): Promise<void> {
  const { organizationId, ...rest } = input;
  const canSee = organizationId == null
    ? undefined
    : or(
        eq(users.platformRole, "super_admin"),
        exists(tx.select({ one: member.id }).from(member).where(and(eq(member.userId, users.id), eq(member.organizationId, organizationId)))),
      );
  const staff = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, STAFF_ROLES), eq(users.status, "active"), canSee));
  const channels = rest.channels ?? (rest.event ? EVENTS[rest.event].channels : undefined);
  await enqueueMany(
    tx,
    notificationTables,
    usersRef,
    staff.map((s) => ({
      ...rest,
      recipientId: s.id,
      channels,
      // Same per-recipient suffix enqueueToRole used, so keys written before this change still dedupe.
      dedupeKey: rest.dedupeKey ? `${rest.dedupeKey}:u${s.id}` : undefined,
    })),
  );
  markOutboxDirty();
}
