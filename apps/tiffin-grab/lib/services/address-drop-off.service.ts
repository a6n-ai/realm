/**
 * A saved address's drop-off: its place type (tag: Home, Apartment…) and that tag's delivery
 * strategies (at most one per connected set), on customer_addresses.delivery_tag_id and
 * delivery_strategy_ids. @foundry/address only knows the shared address fields, so the app
 * sets and reads these columns itself. It is the default for new checkouts and re-addressed
 * deliveries; it never reprices a paid plan. Everything is optional.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { AddressScope } from "@foundry/address";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { customerAddresses, deliveryStrategies, deliveryStrategyGroups } from "@/db/schema";
import type { DropOffValue } from "@/lib/catalog/drop-off";

type Tx = Pick<typeof db, "select" | "update">;
export type ResolvedDropOff = { tagId: bigint | null; strategyIds: bigint[] };

/**
 * Internal ids for a customer's pick. Refuses a retired or unknown tag or strategy, a strategy
 * outside the picked tag, or two strategies from one connected set. No tag given = the
 * strategies' own tag.
 */
export async function resolveDropOff(value: DropOffValue | null | undefined, tx: Tx = db): Promise<ResolvedDropOff> {
  const tagPublicId: unknown = value?.tagId ?? null;
  const picks: unknown = value?.strategyIds ?? [];
  if ((tagPublicId !== null && typeof tagPublicId !== "string") || !Array.isArray(picks) || picks.some((p) => typeof p !== "string")) {
    throw new ValidationError("Invalid drop-off options");
  }
  const ids = [...new Set(picks as string[])];
  let tagId: bigint | null = null;
  if (tagPublicId) {
    const [tag] = await tx
      .select({ id: deliveryStrategyGroups.id })
      .from(deliveryStrategyGroups)
      .where(and(eq(deliveryStrategyGroups.publicId, tagPublicId), eq(deliveryStrategyGroups.active, true)))
      .limit(1);
    if (!tag) throw new ValidationError("That place type isn't available");
    tagId = tag.id;
  }
  if (ids.length === 0) return { tagId, strategyIds: [] };

  const rows = await tx
    .select({ id: deliveryStrategies.id, publicId: deliveryStrategies.publicId, groupId: deliveryStrategies.groupId, connectionId: deliveryStrategies.connectionId })
    .from(deliveryStrategies)
    .innerJoin(deliveryStrategyGroups, eq(deliveryStrategyGroups.id, deliveryStrategies.groupId))
    .where(and(inArray(deliveryStrategies.publicId, ids), eq(deliveryStrategies.active, true), eq(deliveryStrategyGroups.active, true)));
  if (rows.length !== ids.length) throw new ValidationError("That delivery strategy isn't available");
  tagId ??= rows[0]!.groupId;
  if (rows.some((r) => r.groupId !== tagId)) throw new ValidationError("Delivery strategies must all be for the chosen place");
  const sets = rows.flatMap((r) => (r.connectionId == null ? [] : [r.connectionId]));
  if (new Set(sets).size !== sets.length) throw new ValidationError("Pick only one strategy from each connected set");
  return { tagId, strategyIds: ids.map((p) => rows.find((r) => r.publicId === p)!.id) };
}

/** Sets (or clears) the drop-off on one of the customer's own addresses. */
export async function setAddressDropOff(
  scope: AddressScope,
  address: { publicId: string } | { id: bigint },
  value: DropOffValue | null | undefined,
  tx: Tx = db,
): Promise<void> {
  const r = await resolveDropOff(value, tx);
  await tx
    .update(customerAddresses)
    .set({ deliveryTagId: r.tagId, deliveryStrategyIds: r.strategyIds, updatedAt: Date.now() })
    .where(and(
      "id" in address ? eq(customerAddresses.id, address.id) : eq(customerAddresses.publicId, address.publicId),
      eq(customerAddresses.userId, scope.userId),
    ));
}

/** Internal ids → public ids for the tags and strategies still offered; retired ones drop out. */
export async function toDropOffValues(rows: ResolvedDropOff[]): Promise<DropOffValue[]> {
  const tagIds = [...new Set(rows.flatMap((r) => (r.tagId == null ? [] : [r.tagId])))];
  const strategyIds = [...new Set(rows.flatMap((r) => r.strategyIds))];
  const [tags, strategies] = await Promise.all([
    tagIds.length
      ? db.select({ id: deliveryStrategyGroups.id, publicId: deliveryStrategyGroups.publicId }).from(deliveryStrategyGroups)
          .where(and(inArray(deliveryStrategyGroups.id, tagIds), eq(deliveryStrategyGroups.active, true)))
      : [],
    strategyIds.length
      ? db.select({ id: deliveryStrategies.id, publicId: deliveryStrategies.publicId }).from(deliveryStrategies)
          .where(and(inArray(deliveryStrategies.id, strategyIds), eq(deliveryStrategies.active, true)))
      : [],
  ]);
  const tag = new Map(tags.map((t) => [t.id, t.publicId]));
  const strategy = new Map(strategies.map((s) => [s.id, s.publicId]));
  return rows.map((r) => {
    const tagId = r.tagId == null ? null : (tag.get(r.tagId) ?? null);
    // A retired place type takes its strategies with it.
    return { tagId, strategyIds: tagId ? r.strategyIds.flatMap((id) => strategy.get(id) ?? []) : [] };
  });
}

/** Address public id → its drop-off (addresses with none are left out). */
export async function dropOffsFor(addressPublicIds: string[]): Promise<Record<string, DropOffValue>> {
  if (addressPublicIds.length === 0) return {};
  const rows = await db
    .select({ address: customerAddresses.publicId, tagId: customerAddresses.deliveryTagId, strategyIds: customerAddresses.deliveryStrategyIds })
    .from(customerAddresses)
    .where(inArray(customerAddresses.publicId, addressPublicIds));
  const values = await toDropOffValues(rows);
  return Object.fromEntries(rows.flatMap((r, i) => (values[i]!.tagId ? [[r.address, values[i]!]] : [])));
}
