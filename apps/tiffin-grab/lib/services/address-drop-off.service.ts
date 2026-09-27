/**
 * A saved address's drop-off: the admin delivery strategy options (Doorstep, Don't ring…)
 * it is delivered with, at most one per strategy group, stored on
 * customer_addresses.delivery_strategy_ids. @foundry/address only knows the shared address
 * fields, so the app sets and reads this column itself. It is the default for new checkouts
 * and re-addressed deliveries; it never reprices a paid plan.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { AddressScope } from "@foundry/address";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { customerAddresses, deliveryStrategies, deliveryStrategyGroups } from "@/db/schema";

type Tx = Pick<typeof db, "select" | "update">;

/**
 * Active option ids for public ids, one per group; empty/null clears. Refuses an option that
 * is retired, unknown, outside an active group, or a second pick in the same group.
 */
export async function strategyIdsFor(publicIds: string[] | null | undefined, tx: Tx = db): Promise<bigint[]> {
  if (!publicIds?.length) return [];
  if (!Array.isArray(publicIds) || publicIds.some((p) => typeof p !== "string")) {
    throw new ValidationError("Invalid drop-off options");
  }
  const rows = await tx
    .select({ id: deliveryStrategies.id, publicId: deliveryStrategies.publicId, groupId: deliveryStrategies.groupId })
    .from(deliveryStrategies)
    .innerJoin(deliveryStrategyGroups, eq(deliveryStrategyGroups.id, deliveryStrategies.groupId))
    .where(and(inArray(deliveryStrategies.publicId, publicIds), eq(deliveryStrategies.active, true), eq(deliveryStrategyGroups.active, true)));
  if (rows.length !== new Set(publicIds).size) throw new ValidationError("That drop-off option isn't available");
  if (new Set(rows.map((r) => r.groupId)).size !== rows.length) throw new ValidationError("Pick one option per drop-off question");
  return [...new Set(publicIds)].flatMap((p) => rows.find((r) => r.publicId === p)?.id ?? []);
}

/** Sets (or clears) the drop-off on one of the customer's own addresses. */
export async function setAddressDropOff(
  scope: AddressScope,
  address: { publicId: string } | { id: bigint },
  strategyPublicIds: string[] | null | undefined,
  tx: Tx = db,
): Promise<void> {
  const ids = await strategyIdsFor(strategyPublicIds, tx);
  await tx
    .update(customerAddresses)
    .set({ deliveryStrategyIds: ids, updatedAt: Date.now() })
    .where(and(
      "id" in address ? eq(customerAddresses.id, address.id) : eq(customerAddresses.publicId, address.publicId),
      eq(customerAddresses.userId, scope.userId),
    ));
}

/** Option id → public id for the still-offered ones; retired options drop out. */
export async function activeStrategyPublicIds(ids: bigint[]): Promise<Map<bigint, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: deliveryStrategies.id, publicId: deliveryStrategies.publicId })
    .from(deliveryStrategies)
    .innerJoin(deliveryStrategyGroups, eq(deliveryStrategyGroups.id, deliveryStrategies.groupId))
    // A retired option is no drop-off: pricing refuses it, so it is never preselected.
    .where(and(inArray(deliveryStrategies.id, ids), eq(deliveryStrategies.active, true), eq(deliveryStrategyGroups.active, true)));
  return new Map(rows.map((r) => [r.id, r.publicId]));
}

/** Address public id → its drop-off option public ids (addresses with none are left out). */
export async function dropOffsFor(addressPublicIds: string[]): Promise<Record<string, string[]>> {
  if (addressPublicIds.length === 0) return {};
  const rows = await db
    .select({ address: customerAddresses.publicId, ids: customerAddresses.deliveryStrategyIds })
    .from(customerAddresses)
    .where(inArray(customerAddresses.publicId, addressPublicIds));
  const publicIds = await activeStrategyPublicIds([...new Set(rows.flatMap((r) => r.ids))]);
  return Object.fromEntries(
    rows
      .map((r) => [r.address, r.ids.flatMap((id) => publicIds.get(id) ?? [])] as const)
      .filter(([, picks]) => picks.length > 0),
  );
}
