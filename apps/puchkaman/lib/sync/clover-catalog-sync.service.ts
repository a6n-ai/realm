/**
 * Clover catalog sync (categories, modifier groups, modifiers, discounts, menus).
 *
 * Entity map (Clover → local):
 * - items              → products (+ clover_* mirror columns)
 * - categories         → product_categories (colorCode preserved)
 * - category_items     → product_category_items
 * - modifier_groups    → modifier_groups
 * - modifiers          → modifiers
 * - item_modifier_groups → product_modifier_groups
 * - discounts          → discounts
 * - tax_rates          → tax_rates
 * - tags               → printer_labels
 * (item ↔ tax_rate / tag links ride on the item pull, which expands taxRates,tags)
 * - (no Menus API)     → menus + menu_sections built from categories
 *
 * Pull is SoT: missing remote rows are marked inactive (not deleted).
 * Category push is implemented; other entity pushes are stubs for a later pass.
 *
 * Deferred: checkout modifier UX, checkout discount engine, Online Ordering menus API.
 */

import {
  cloverCentsToDollars,
  dollarsToCloverCents,
  type CloverApiClient,
  type CloverCategory,
  type CloverDiscount,
  type CloverModifier,
  type CloverModifierGroup,
  type CloverTag,
  type CloverTaxRate,
  cloverRateToPercent,
} from "@realm/clover";
import {
  discountsRepository,
  printerLabelsRepository,
  taxRatesRepository,
  menusRepository,
  menuSectionsRepository,
  modifierGroupsRepository,
  modifiersRepository,
  productCategoriesRepository,
  productCategoryItemsRepository,
  productModifierGroupsRepository,
  type ModifierGroupRow,
  type ProductCategoryRow,
} from "@/lib/services/inventory.repository";
import { productsRepository } from "@/lib/services/products.repository";

const REGISTER_MENU_NAME = "Register";

export type CloverCatalogPullResult = {
  categories: { upserted: number; inactivated: number };
  modifierGroups: { upserted: number; inactivated: number };
  modifiers: { upserted: number; inactivated: number };
  discounts: { upserted: number; inactivated: number };
  taxRates: { upserted: number; inactivated: number };
  printerLabels: { upserted: number; inactivated: number };
  menus: { upserted: number };
  links: {
    categoryItems: number;
    productModifierGroups: number;
    menuSections: number;
  };
  errors: Array<{ entity: string; id?: string; message: string }>;
};

export type CloverCategoryPushResult = {
  created: string[];
  updated: string[];
  errors: Array<{ publicId: string; message: string }>;
};

export type CloverCategoryPushOptions = {
  publicIds?: string[];
};

class CloverCatalogSyncService {
  async pull(client: CloverApiClient): Promise<CloverCatalogPullResult> {
    const result: CloverCatalogPullResult = {
      categories: { upserted: 0, inactivated: 0 },
      modifierGroups: { upserted: 0, inactivated: 0 },
      modifiers: { upserted: 0, inactivated: 0 },
      discounts: { upserted: 0, inactivated: 0 },
      taxRates: { upserted: 0, inactivated: 0 },
      printerLabels: { upserted: 0, inactivated: 0 },
      menus: { upserted: 0 },
      links: { categoryItems: 0, productModifierGroups: 0, menuSections: 0 },
      errors: [],
    };

    const now = Date.now();

    // ── Categories ──────────────────────────────────────────────────────────
    const cloverCategories = await client.listAllCategories({ expand: "items" });
    const seenCategoryIds = new Set<string>();
    const categoryByCloverId = new Map<string, ProductCategoryRow>();

    for (const cat of cloverCategories) {
      try {
        const row = await this.upsertCategory(cat, now);
        categoryByCloverId.set(cat.id, row);
        seenCategoryIds.add(cat.id);
        result.categories.upserted += 1;

        // Link products via clover item ids when local products exist.
        const itemIds = cat.items?.elements?.map((e) => e.id) ?? [];
        for (let i = 0; i < itemIds.length; i++) {
          const product = await productsRepository.findByCloverItemId(itemIds[i]!);
          if (!product) continue;
          const existing = await productCategoryItemsRepository.findByCategoryAndProduct(
            row.id,
            product.id,
          );
          if (existing) {
            await productCategoryItemsRepository.updateByPublicId(existing.publicId, {
              sortOrder: i,
            });
          } else {
            await productCategoryItemsRepository.create({
              categoryId: row.id,
              productId: product.id,
              sortOrder: i,
            });
          }
          result.links.categoryItems += 1;
        }
      } catch (err) {
        result.errors.push({
          entity: "category",
          id: cat.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const local of await productCategoriesRepository.findAll()) {
      if (local.cloverCategoryId && !seenCategoryIds.has(local.cloverCategoryId) && local.active) {
        await productCategoriesRepository.updateByInternalId(local.id, { active: false });
        result.categories.inactivated += 1;
      }
    }

    // ── Modifier groups + modifiers ─────────────────────────────────────────
    const cloverGroups = await client.listAllModifierGroups({ expand: "modifiers,items" });
    const seenGroupIds = new Set<string>();
    const seenModifierIds = new Set<string>();

    for (const group of cloverGroups) {
      try {
        const groupRow = await this.upsertModifierGroup(group, now);
        seenGroupIds.add(group.id);
        result.modifierGroups.upserted += 1;

        const mods = group.modifiers?.elements ?? [];
        for (const mod of mods) {
          try {
            await this.upsertModifier(mod, groupRow.id, now);
            seenModifierIds.add(mod.id);
            result.modifiers.upserted += 1;
          } catch (err) {
            result.errors.push({
              entity: "modifier",
              id: mod.id,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const itemIds = group.items?.elements?.map((e) => e.id) ?? [];
        for (const itemId of itemIds) {
          const product = await productsRepository.findByCloverItemId(itemId);
          if (!product) continue;
          const existing = await productModifierGroupsRepository.findByProductAndGroup(
            product.id,
            groupRow.id,
          );
          if (!existing) {
            await productModifierGroupsRepository.create({
              productId: product.id,
              modifierGroupId: groupRow.id,
            });
          }
          result.links.productModifierGroups += 1;
        }
      } catch (err) {
        result.errors.push({
          entity: "modifier_group",
          id: group.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const local of await modifierGroupsRepository.findAll()) {
      if (
        local.cloverModifierGroupId &&
        !seenGroupIds.has(local.cloverModifierGroupId) &&
        local.active
      ) {
        await modifierGroupsRepository.updateByInternalId(local.id, { active: false });
        result.modifierGroups.inactivated += 1;
      }
    }

    for (const local of await modifiersRepository.findAll()) {
      if (local.cloverModifierId && !seenModifierIds.has(local.cloverModifierId) && local.active) {
        await modifiersRepository.updateByInternalId(local.id, {
          active: false,
          available: false,
        });
        result.modifiers.inactivated += 1;
      }
    }

    // ── Discounts ───────────────────────────────────────────────────────────
    const cloverDiscounts = await client.listAllDiscounts();
    const seenDiscountIds = new Set<string>();

    for (const disc of cloverDiscounts) {
      try {
        await this.upsertDiscount(disc, now);
        seenDiscountIds.add(disc.id);
        result.discounts.upserted += 1;
      } catch (err) {
        result.errors.push({
          entity: "discount",
          id: disc.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const local of await discountsRepository.findAll()) {
      if (local.cloverDiscountId && !seenDiscountIds.has(local.cloverDiscountId) && local.active) {
        await discountsRepository.updateByInternalId(local.id, { active: false });
        result.discounts.inactivated += 1;
      }
    }

    // ── Tax rates ───────────────────────────────────────────────────────────
    const cloverTaxRates = await client.listAllTaxRates();
    const seenTaxRateIds = new Set<string>();

    for (const tax of cloverTaxRates) {
      try {
        await this.upsertTaxRate(tax, now);
        seenTaxRateIds.add(tax.id);
        result.taxRates.upserted += 1;
      } catch (err) {
        result.errors.push({
          entity: "tax_rate",
          id: tax.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const local of await taxRatesRepository.findAll()) {
      if (local.cloverTaxRateId && !seenTaxRateIds.has(local.cloverTaxRateId) && local.active) {
        await taxRatesRepository.updateByInternalId(local.id, { active: false });
        result.taxRates.inactivated += 1;
      }
    }

    // ── Printer labels (Clover tags) ────────────────────────────────────────
    const cloverTags = await client.listAllTags();
    const seenTagIds = new Set<string>();

    for (const tag of cloverTags) {
      try {
        await this.upsertPrinterLabel(tag, now);
        seenTagIds.add(tag.id);
        result.printerLabels.upserted += 1;
      } catch (err) {
        result.errors.push({
          entity: "printer_label",
          id: tag.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const local of await printerLabelsRepository.findAll()) {
      if (local.cloverTagId && !seenTagIds.has(local.cloverTagId) && local.active) {
        await printerLabelsRepository.updateByInternalId(local.id, { active: false });
        result.printerLabels.inactivated += 1;
      }
    }

    // ── Register menu (from categories) ─────────────────────────────────────
    try {
      let menu = await menusRepository.findByName(REGISTER_MENU_NAME);
      if (!menu) {
        menu = await menusRepository.create({
          name: REGISTER_MENU_NAME,
          sortOrder: 0,
          active: true,
          cloverLastSyncedAt: now,
        });
      } else {
        await menusRepository.updateByInternalId(menu.id, {
          active: true,
          cloverLastSyncedAt: now,
        });
        menu = (await menusRepository.findByName(REGISTER_MENU_NAME))!;
      }
      result.menus.upserted = 1;

      const activeCats = [...categoryByCloverId.values()]
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      for (const cat of activeCats) {
        const existing = await menuSectionsRepository.findByMenuAndCategory(menu.id, cat.id);
        if (existing) {
          await menuSectionsRepository.updateByPublicId(existing.publicId, {
            sortOrder: cat.sortOrder,
          });
        } else {
          await menuSectionsRepository.create({
            menuId: menu.id,
            categoryId: cat.id,
            sortOrder: cat.sortOrder,
          });
        }
        result.links.menuSections += 1;
      }
    } catch (err) {
      result.errors.push({
        entity: "menu",
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  /** Push local categories to Clover (create or update by cloverCategoryId). */
  async pushCategories(
    client: CloverApiClient,
    opts: CloverCategoryPushOptions = {},
  ): Promise<CloverCategoryPushResult> {
    const result: CloverCategoryPushResult = { created: [], updated: [], errors: [] };
    const rows = opts.publicIds?.length
      ? (
          await Promise.all(
            opts.publicIds.map((id) => productCategoriesRepository.findByPublicId(id)),
          )
        ).filter((r): r is ProductCategoryRow => !!r)
      : await productCategoriesRepository.findAll();

    const now = Date.now();
    for (const row of rows) {
      try {
        if (row.cloverCategoryId) {
          await client.updateCategory(row.cloverCategoryId, {
            name: row.name,
            sortOrder: row.sortOrder,
            colorCode: row.colorCode ?? null,
          });
          await productCategoriesRepository.updateByInternalId(row.id, {
            cloverLastSyncedAt: now,
          });
          result.updated.push(row.publicId);
        } else {
          const created = await client.createCategory({
            name: row.name,
            sortOrder: row.sortOrder,
            colorCode: row.colorCode ?? null,
          });
          await productCategoriesRepository.updateByInternalId(row.id, {
            cloverCategoryId: created.id,
            cloverLastSyncedAt: now,
            colorCode: created.colorCode ?? row.colorCode,
          });
          result.created.push(row.publicId);
        }
      } catch (err) {
        result.errors.push({
          publicId: row.publicId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  }

  /**
   * Mirror of pushCategories for modifier groups. Clover has no "delete" here —
   * an inactive group stays in Clover; `active` is a local display flag, so it
   * is deliberately not part of the pushed payload.
   */
  async pushModifierGroups(
    client: CloverApiClient,
    opts: CloverCategoryPushOptions = {},
  ): Promise<CloverCategoryPushResult> {
    const result: CloverCategoryPushResult = { created: [], updated: [], errors: [] };
    const rows = opts.publicIds?.length
      ? (
          await Promise.all(
            opts.publicIds.map((id) => modifierGroupsRepository.findByPublicId(id)),
          )
        ).filter((r): r is ModifierGroupRow => !!r)
      : await modifierGroupsRepository.findAll();

    const now = Date.now();
    for (const row of rows) {
      const payload = {
        name: row.name,
        alternateName: row.alternateName ?? null,
        minRequired: row.minRequired ?? null,
        maxAllowed: row.maxAllowed ?? null,
        showByDefault: row.showByDefault,
        sortOrder: row.sortOrder,
      };
      try {
        if (row.cloverModifierGroupId) {
          await client.updateModifierGroup(row.cloverModifierGroupId, payload);
          await modifierGroupsRepository.updateByInternalId(row.id, { cloverLastSyncedAt: now });
          result.updated.push(row.publicId);
        } else {
          const created = await client.createModifierGroup(payload);
          await modifierGroupsRepository.updateByInternalId(row.id, {
            cloverModifierGroupId: created.id,
            cloverLastSyncedAt: now,
          });
          result.created.push(row.publicId);
        }
      } catch (err) {
        result.errors.push({
          publicId: row.publicId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  }

  async pushDiscounts(_client: CloverApiClient): Promise<{ deferred: true; reason: string }> {
    return {
      deferred: true,
      reason: "discount push deferred — pull sync is SoT for this pass",
    };
  }

  private async upsertCategory(cat: CloverCategory, now: number): Promise<ProductCategoryRow> {
    const patch = {
      name: cat.name,
      sortOrder: cat.sortOrder ?? 0,
      colorCode: cat.colorCode ?? null,
      active: cat.deleted !== true,
      cloverCategoryId: cat.id,
      cloverParentCategoryId: cat.parentCategory?.id ?? null,
      cloverLastSyncedAt: now,
    };
    const existing = await productCategoriesRepository.findByCloverCategoryId(cat.id);
    if (existing) {
      const updated = await productCategoriesRepository.updateByInternalId(existing.id, patch);
      return updated ?? existing;
    }
    return productCategoriesRepository.create(patch);
  }

  private async upsertModifierGroup(group: CloverModifierGroup, now: number) {
    const patch = {
      name: group.name,
      alternateName: group.alternateName ?? null,
      minRequired: group.minRequired ?? null,
      maxAllowed: group.maxAllowed ?? null,
      showByDefault: group.showByDefault !== false,
      sortOrder: group.sortOrder ?? 0,
      active: group.deleted !== true,
      cloverModifierGroupId: group.id,
      cloverLastSyncedAt: now,
    };
    const existing = await modifierGroupsRepository.findByCloverModifierGroupId(group.id);
    if (existing) {
      return (
        (await modifierGroupsRepository.updateByInternalId(existing.id, patch)) ?? existing
      );
    }
    return modifierGroupsRepository.create(patch);
  }

  private async upsertModifier(
    mod: CloverModifier,
    modifierGroupId: bigint,
    now: number,
  ) {
    const priceDollars = cloverCentsToDollars(mod.price ?? 0);
    const patch = {
      modifierGroupId,
      name: mod.name,
      alternateName: mod.alternateName ?? null,
      price: String(priceDollars),
      available: mod.available !== false,
      active: mod.deleted !== true,
      cloverModifierId: mod.id,
      cloverLastSyncedAt: now,
    };
    const existing = await modifiersRepository.findByCloverModifierId(mod.id);
    if (existing) {
      return (await modifiersRepository.updateByInternalId(existing.id, patch)) ?? existing;
    }
    return modifiersRepository.create(patch);
  }

  private async upsertTaxRate(tax: CloverTaxRate, now: number) {
    // A Clover tax rate is either percentage or flat; keep the unused side null
    // so a reader never has to decide which of two populated fields wins.
    const percent = cloverRateToPercent(tax.rate);
    const isFlat = tax.taxAmount != null && (tax.rate == null || tax.rate === 0);
    const patch = {
      name: tax.name,
      rate: isFlat || percent == null ? null : String(percent),
      taxAmount: isFlat ? tax.taxAmount! : null,
      taxType: tax.taxType ?? null,
      isDefault: tax.isDefault === true,
      active: tax.deleted !== true,
      cloverTaxRateId: tax.id,
      cloverLastSyncedAt: now,
    };
    const existing = await taxRatesRepository.findByCloverTaxRateId(tax.id);
    if (existing) {
      return (await taxRatesRepository.updateByInternalId(existing.id, patch)) ?? existing;
    }
    return taxRatesRepository.create(patch);
  }

  private async upsertPrinterLabel(tag: CloverTag, now: number) {
    const patch = {
      name: tag.name,
      showInReporting: tag.showInReporting === true,
      active: tag.deleted !== true,
      cloverTagId: tag.id,
      cloverLastSyncedAt: now,
    };
    const existing = await printerLabelsRepository.findByCloverTagId(tag.id);
    if (existing) {
      return (await printerLabelsRepository.updateByInternalId(existing.id, patch)) ?? existing;
    }
    return printerLabelsRepository.create(patch);
  }

  private async upsertDiscount(disc: CloverDiscount, now: number) {
    const amountDollars =
      disc.amount != null ? cloverCentsToDollars(disc.amount) : null;
    const patch = {
      name: disc.name,
      amount: amountDollars != null ? String(amountDollars) : null,
      percentage: disc.percentage != null ? String(disc.percentage) : null,
      active: disc.deleted !== true,
      cloverDiscountId: disc.id,
      cloverLastSyncedAt: now,
    };
    const existing = await discountsRepository.findByCloverDiscountId(disc.id);
    if (existing) {
      return (await discountsRepository.updateByInternalId(existing.id, patch)) ?? existing;
    }
    return discountsRepository.create(patch);
  }
}

export const cloverCatalogSyncService = new CloverCatalogSyncService();

/** Re-export for callers that need cents helpers when building push payloads later. */
export { dollarsToCloverCents };
