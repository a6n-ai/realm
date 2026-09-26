/**
 * A saved address's drop-off: the admin delivery strategy (Front door, Back door…) it is
 * delivered with, stored on customer_addresses.delivery_strategy_id. @foundry/address only
 * knows the shared address fields, so the app sets and reads this column itself. It is the
 * default for new checkouts and re-addressed deliveries; it never reprices a paid plan.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { AddressScope } from "@foundry/address";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { customerAddresses, deliveryStrategies } from "@/db/schema";

type Tx = Pick<typeof db, "select" | "update">;

/** Active strategy id for a public id; null clears. Refuses one that is retired or unknown. */
export async function strategyIdFor(strategyPublicId: string | null | undefined, tx: Tx = db): Promise<bigint | null> {
  if (!strategyPublicId) return null;
  const [row] = await tx
    .select({ id: deliveryStrategies.id })
    .from(deliveryStrategies)
    .where(and(eq(deliveryStrategies.publicId, strategyPublicId), eq(deliveryStrategies.active, true)))
    .limit(1);
  if (!row) throw new ValidationError("That drop-off option isn't available");
  return row.id;
}

/** Sets (or clears) the drop-off on one of the customer's own addresses. */
export async function setAddressDropOff(
  scope: AddressScope,
  address: { publicId: string } | { id: bigint },
  strategyPublicId: string | null | undefined,
  tx: Tx = db,
): Promise<void> {
  const strategyId = await strategyIdFor(strategyPublicId, tx);
  await tx
    .update(customerAddresses)
    .set({ deliveryStrategyId: strategyId, updatedAt: Date.now() })
    .where(and(
      "id" in address ? eq(customerAddresses.id, address.id) : eq(customerAddresses.publicId, address.publicId),
      eq(customerAddresses.userId, scope.userId),
    ));
}

/** Address public id → its drop-off's strategy public id (none, or a retired one, is left out). */
export async function dropOffsFor(addressPublicIds: string[]): Promise<Record<string, string>> {
  if (addressPublicIds.length === 0) return {};
  const rows = await db
    .select({ address: customerAddresses.publicId, strategy: deliveryStrategies.publicId })
    .from(customerAddresses)
    .innerJoin(deliveryStrategies, eq(deliveryStrategies.id, customerAddresses.deliveryStrategyId))
    // A retired strategy is no drop-off: pricing refuses it, so it is never preselected.
    .where(and(inArray(customerAddresses.publicId, addressPublicIds), eq(deliveryStrategies.active, true)));
  return Object.fromEntries(rows.map((r) => [r.address, r.strategy]));
}
