import { orgScope, type Visible } from "@/lib/tenant/org-scope";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { db, type Tx } from "@/db/client";
import { orderActivities, orders, tickets } from "@/db/schema";

const CLEAR_LOOK_OUT = { lookOutAt: null, lookOutBy: null, lookOutNote: null };

/** An ended order (completed or cancelled) has nothing left to watch, so it leaves the Look out for tab. */
export async function clearLookOutOnEnd(tx: Tx, orderId: bigint, why: string): Promise<void> {
  const [row] = await tx.update(orders)
    .set(CLEAR_LOOK_OUT)
    .where(and(eq(orders.id, orderId), isNotNull(orders.lookOutAt)))
    .returning({ organizationId: orders.organizationId });
  if (row) await tx.insert(orderActivities).values({ orderId, type: "note", note: `Look out for cleared: ${why}`, organizationId: row.organizationId });
}

/** Any staff member flags an order the whole team should watch (always with why), or clears the flag.
 * Marking an already flagged order re-marks it: new note, new marker. Logged as an order note,
 * like updatePaymentReference. */
export async function setOrderLookOut(
  orderPublicId: string,
  on: boolean,
  note: string,
  actorId: bigint | null = null,
): Promise<void> {
  const reason = note.trim();
  if (!reason) throw new ValidationError(on ? "Add a note on what to look out for" : "Add a note on why it is being unmarked");
  if (reason.length > 300) throw new ValidationError("Keep the note under 300 characters");
  await db.transaction(async (tx) => {
    // Row lock: two staff marking at once log one "Marked" and one "note changed", not two "Marked".
    const [order] = await tx.select({ id: orders.id, lookOutAt: orders.lookOutAt, organizationId: orders.organizationId })
      .from(orders).where(eq(orders.publicId, orderPublicId)).limit(1).for("update");
    if (!order) throw new NotFoundError("Order not found");
    if (!on && order.lookOutAt == null) return;

    await tx
      .update(orders)
      .set(on ? { lookOutAt: Date.now(), lookOutBy: actorId, lookOutNote: reason } : CLEAR_LOOK_OUT)
      .where(eq(orders.id, order.id));
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "note",
      note: !on ? `Look out for cleared: ${reason}` : order.lookOutAt == null ? `Marked look out for: ${reason}` : `Look out for note changed: ${reason}`,
      createdBy: actorId,
      organizationId: order.organizationId,
    });
  });
}

const TICKET_NOTE = "Support ticket: ";

/** A support ticket puts its order on the look-out list. A flag staff already set is left alone. */
export async function lookOutForTicket(orderId: bigint, subject: string): Promise<void> {
  const note = `${TICKET_NOTE}${subject}`.slice(0, 300);
  const [flagged] = await db
    .update(orders)
    .set({ lookOutAt: Date.now(), lookOutBy: null, lookOutNote: note })
    .where(and(eq(orders.id, orderId), isNull(orders.lookOutAt)))
    .returning({ id: orders.id });
  if (flagged) await db.insert(orderActivities).values({ orderId, type: "note", note: `Marked look out for: ${note}` });
}

/**
 * A resolved ticket takes its order back off the list, but only a flag a ticket set: one staff
 * marked or edited carries their name and stays. Another ticket still open on the order keeps it.
 */
export async function clearTicketLookOut(orderId: bigint): Promise<void> {
  const [cleared] = await db
    .update(orders)
    .set(CLEAR_LOOK_OUT)
    .where(and(
      eq(orders.id, orderId),
      isNotNull(orders.lookOutAt),
      isNull(orders.lookOutBy),
      sql`starts_with(${orders.lookOutNote}, ${TICKET_NOTE})`,
      sql`not exists (select 1 from ${tickets} where ${tickets.orderId} = ${orderId} and ${tickets.status} not in ('resolved', 'closed'))`,
    ))
    .returning({ id: orders.id });
  if (cleared) await db.insert(orderActivities).values({ orderId, type: "note", note: "Look out for cleared: support ticket resolved" });
}

export async function countLookOutOrders(visible: Visible): Promise<number> {
  if (visible !== "all" && visible.length === 0) return 0;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(and(isNotNull(orders.lookOutAt), orgScope(orders.organizationId, visible)));
  return count;
}
