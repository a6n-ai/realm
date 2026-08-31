import { ValidationError } from "@foundry/commons";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { modifierGroups, modifiers, productModifierGroups } from "@/db/schema";
import type { PublicModifier, PublicModifierGroup } from "./modifier-types";

/**
 * Modifier groups offered on the public site, and validation of what a customer picked.
 *
 * Prices here are always the ones read from our Clover mirror — never anything the
 * browser sent. Clover does not look up a modifier's catalog price when pricing an
 * order, so whatever amount we send is what gets billed; trusting the client would
 * let a customer set their own modifier prices.
 */

export type { PublicModifier, PublicModifierGroup } from "./modifier-types";

/**
 * Groups per product, keyed by product id. Groups with no selectable modifier are
 * dropped — the merchant has several (e.g. "Iftar", "Sides") that carry none, and an
 * empty group is just a dead heading on the page.
 */
export async function loadModifierGroupsByProduct(
  productIds: bigint[],
): Promise<Map<string, PublicModifierGroup[]>> {
  const byProduct = new Map<string, PublicModifierGroup[]>();
  if (!productIds.length) return byProduct;

  const rows = await db
    .select({
      productId: productModifierGroups.productId,
      groupCloverId: modifierGroups.cloverModifierGroupId,
      groupName: modifierGroups.name,
      minRequired: modifierGroups.minRequired,
      maxAllowed: modifierGroups.maxAllowed,
      showByDefault: modifierGroups.showByDefault,
      sortOrder: modifierGroups.sortOrder,
      modifierCloverId: modifiers.cloverModifierId,
      modifierName: modifiers.name,
      modifierPrice: modifiers.price,
    })
    .from(productModifierGroups)
    .innerJoin(modifierGroups, eq(modifierGroups.id, productModifierGroups.modifierGroupId))
    .innerJoin(
      modifiers,
      and(
        eq(modifiers.modifierGroupId, modifierGroups.id),
        eq(modifiers.active, true),
        eq(modifiers.available, true),
      ),
    )
    .where(and(inArray(productModifierGroups.productId, productIds), eq(modifierGroups.active, true)))
    .orderBy(asc(modifierGroups.sortOrder), asc(modifierGroups.name), asc(modifiers.name));

  for (const r of rows) {
    if (!r.groupCloverId || !r.modifierCloverId) continue;
    const key = r.productId.toString();
    const groups = byProduct.get(key) ?? [];
    let group = groups.find((g) => g.cloverModifierGroupId === r.groupCloverId);
    if (!group) {
      group = {
        cloverModifierGroupId: r.groupCloverId,
        name: r.groupName,
        minRequired: r.minRequired,
        maxAllowed: r.maxAllowed,
        showByDefault: r.showByDefault,
        modifiers: [],
      };
      groups.push(group);
    }
    group.modifiers.push({
      cloverModifierId: r.modifierCloverId,
      name: r.modifierName,
      price: Number(r.modifierPrice) || 0,
    });
    byProduct.set(key, groups);
  }

  return byProduct;
}

/**
 * Resolve the ids a customer picked into priced modifiers, rejecting anything the
 * product doesn't offer or any group whose min/max rule is broken.
 */
export function resolveSelectedModifiers(
  productName: string,
  groups: PublicModifierGroup[],
  selectedIds: string[],
): PublicModifier[] {
  const unique = [...new Set(selectedIds)];
  if (unique.length !== selectedIds.length) {
    throw new ValidationError(`Duplicate options selected for ${productName}`);
  }

  const offered = new Map<string, { modifier: PublicModifier; group: PublicModifierGroup }>();
  for (const group of groups) {
    for (const modifier of group.modifiers) {
      offered.set(modifier.cloverModifierId, { modifier, group });
    }
  }

  const resolved: PublicModifier[] = [];
  const countByGroup = new Map<string, number>();
  for (const id of unique) {
    const hit = offered.get(id);
    if (!hit) {
      throw new ValidationError(`That option isn't available for ${productName}`);
    }
    resolved.push(hit.modifier);
    const key = hit.group.cloverModifierGroupId;
    countByGroup.set(key, (countByGroup.get(key) ?? 0) + 1);
  }

  for (const group of groups) {
    const count = countByGroup.get(group.cloverModifierGroupId) ?? 0;
    const min = group.minRequired ?? 0;
    if (count < min) {
      throw new ValidationError(
        min === 1
          ? `Choose an option for ${group.name} on ${productName}`
          : `Choose at least ${min} options for ${group.name} on ${productName}`,
      );
    }
    if (group.maxAllowed != null && count > group.maxAllowed) {
      throw new ValidationError(
        group.maxAllowed === 1
          ? `Only one option can be chosen for ${group.name} on ${productName}`
          : `At most ${group.maxAllowed} options can be chosen for ${group.name} on ${productName}`,
      );
    }
  }

  return resolved;
}
