import { and, eq, gt, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import type { AddressHooks, AddressSnapshot, AddressTx } from "@foundry/address";
import { deliveries, orders } from "@/db/schema";
import { findZone } from "@/lib/catalog/zone-match";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

/** Same rule as assertMutable (deliveries.service.ts): scheduled and cutoff not yet passed. */
async function editable(tx: AddressTx, where: SQL | undefined): Promise<{ id: bigint; orderId: bigint }[]> {
  return tx
    .select({ id: deliveries.id, orderId: deliveries.orderId })
    .from(deliveries)
    .where(and(where, eq(deliveries.status, "scheduled"), gt(deliveries.cutoffAt, Date.now())));
}

/** Same lock every delivery mutation takes, so an address edit can't race a skip/reschedule. */
async function lockOrders(tx: AddressTx, orderIds: bigint[]) {
  const unique = [...new Set(orderIds.map(String))].sort().map(BigInt);
  for (const id of unique) await tx.execute(sql`select pg_advisory_xact_lock(${id})`);
}

async function zoneFor(snapshot: AddressSnapshot, orgId: string | null) {
  const { zones } = await loadCatalogSnapshot(orgId);
  const address = [snapshot.addressLine, snapshot.city, snapshot.postalCode].join(", ");
  const zone = await findZone(zones, { postalCode: snapshot.postalCode, address }, orgId);
  return zone?.id ?? null;
}

const snapshotColumns = (s: AddressSnapshot) => ({
  fullName: s.fullName,
  addressLine: s.addressLine,
  addressUnit: s.addressUnit,
  city: s.city,
  postalCode: s.postalCode,
  deliveryInstructions: s.deliveryInstructions,
});

/** Copy the order's current address onto its NON-editable deliveries that still inherit it. */
async function freezeInheriting(tx: AddressTx, orderId: bigint, editableIds: Set<bigint>) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return;
  const inheriting = await tx
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.orderId, orderId), isNull(deliveries.addressLine)));
  const frozen = inheriting.map((d) => d.id).filter((id) => !editableIds.has(id));
  if (frozen.length === 0) return;
  await tx
    .update(deliveries)
    .set({
      fullName: o.fullName,
      addressLine: o.addressLine,
      addressUnit: o.addressUnit,
      city: o.city,
      postalCode: o.postalCode,
      deliveryInstructions: o.deliveryInstructions,
      zoneId: o.zoneId,
    })
    .where(inArray(deliveries.id, frozen));
}

/**
 * Point every editable delivery and live plan using `fromAddressId` at `to` (snapshot + zone).
 * Refuses — rolling back the caller's tx — if any affected editable delivery would be unserved.
 * Finished plans (completed/cancelled) keep their snapshot: history never moves.
 */
async function retarget(tx: AddressTx, fromAddressId: bigint, toAddressId: bigint, to: AddressSnapshot) {
  const direct = await editable(tx, eq(deliveries.addressId, fromAddressId));
  const planOrders = await tx
    .select({ id: orders.id, orgId: orders.organizationId })
    .from(orders)
    .where(and(eq(orders.addressId, fromAddressId), notInArray(orders.status, ["completed", "cancelled"])));
  const inheritingFromPlan = planOrders.length
    ? await editable(tx, and(inArray(deliveries.orderId, planOrders.map((o) => o.id)), isNull(deliveries.addressLine)))
    : [];
  const affected = [...direct, ...inheritingFromPlan];
  if (affected.length === 0 && planOrders.length === 0) return;

  await lockOrders(tx, [...affected.map((d) => d.orderId), ...planOrders.map((o) => o.id)]);
  const zoneId = await zoneFor(to, planOrders[0]?.orgId ?? null);
  if (zoneId == null && affected.length > 0) {
    const n = affected.length;
    throw new ValidationError(
      `We don't deliver to ${to.postalCode} — ${n} upcoming ${n === 1 ? "delivery uses" : "deliveries use"} this address`,
    );
  }
  const editableIds = new Set(affected.map((d) => d.id));
  for (const o of planOrders) {
    await freezeInheriting(tx, o.id, editableIds);
    await tx
      .update(orders)
      .set({ ...snapshotColumns(to), fullName: to.fullName ?? undefined, addressId: toAddressId, ...(zoneId != null ? { zoneId } : {}) })
      .where(eq(orders.id, o.id));
  }
  if (direct.length) {
    await tx
      .update(deliveries)
      .set({ ...snapshotColumns(to), addressId: toAddressId, zoneId })
      .where(inArray(deliveries.id, direct.map((d) => d.id)));
  }
}

export const addressHooks: AddressHooks = {
  onUpdated: ({ addressId, after }, tx) => retarget(tx, addressId, addressId, after),
  onArchived: async ({ addressId, defaultAddressId, defaultSnapshot }, tx) => {
    if (defaultAddressId && defaultSnapshot) await retarget(tx, addressId, defaultAddressId, defaultSnapshot);
  },
  isInUse: async (addressId, tx) => {
    if ((await editable(tx, eq(deliveries.addressId, addressId))).length) return true;
    const plans = await tx.select({ id: orders.id }).from(orders).where(eq(orders.addressId, addressId));
    return plans.length > 0 && (await editable(tx, inArray(deliveries.orderId, plans.map((p) => p.id)))).length > 0;
  },
};
