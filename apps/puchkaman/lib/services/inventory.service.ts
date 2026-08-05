import { NotFoundError, ValidationError } from "@realm/commons";
import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { columnResolver, conditionToSql } from "@realm/database";
import { asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  discounts,
  menus,
  menuItems,
  menuSections,
  modifierGroups,
  modifiers,
  printerLabels,
  productCategories,
  productCategoryItems,
  productModifierGroups,
  productPrinterLabels,
  productTaxRates,
  products,
  taxRates,
} from "@/db/schema";
import type { CloverApiClient } from "@realm/clover";
import { createCloverClient } from "@/lib/clover/client";
import { productsRepository } from "@/lib/services/products.repository";
import type { SortState } from "@/lib/list/sort";
import type { CategoryEditInput, ModifierGroupEditInput } from "@/lib/inventory/schema";
import {
  cloverCatalogSyncService,
  type CloverCatalogPullResult,
  type CloverCategoryPushResult,
} from "@/lib/sync/clover-catalog-sync.service";
import {
  discountsRepository,
  menusRepository,
  menuSectionsRepository,
  modifierGroupsRepository,
  modifiersRepository,
  printerLabelsRepository,
  productCategoriesRepository,
  productCategoryItemsRepository,
  productModifierGroupsRepository,
  productPrinterLabelsRepository,
  productTaxRatesRepository,
  taxRatesRepository,
  type DiscountRow,
  type MenuRow,
  type ModifierGroupRow,
  type ModifierRow,
  type ProductCategoryRow,
} from "./inventory.repository";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";

/** Sortable keys match DataTable column keys (see menus-table.tsx). */
export type MenuSortColumn = "name" | "status" | "order" | "synced";

const MENU_SORT_COL = {
  name: menus.name,
  status: menus.active,
  order: menus.sortOrder,
  synced: menus.cloverLastSyncedAt,
} as const;

export type MenuListRow = {
  publicId: string;
  name: string;
  active: boolean;
  sortOrder: number;
  itemCount: number;
  /** Provider ids joined for display — Clover exposes no provider-name lookup. */
  channel: string | null;
  cloverPublishedAt: number | null;
  cloverLastSyncedAt: number | null;
};

function resolveMenuFacet(f: FilterCondition) {
  if (f.field === "active") return eq(menus.active, f.value === "true");
  return columnResolver({
    name: menus.name,
  })(f);
}

/** Sortable keys match the DataTable column keys (see categories-table.tsx). */
export type CategorySortColumn = "name" | "status" | "order" | "synced";

const CATEGORY_SORT_COL = {
  name: productCategories.name,
  status: productCategories.active,
  order: productCategories.sortOrder,
  synced: productCategories.cloverLastSyncedAt,
} as const;

function resolveCategoryFacet(f: FilterCondition) {
  if (f.field === "active") return eq(productCategories.active, f.value === "true");
  // "linked" is not a column — it asks whether Clover knows about this row.
  if (f.field === "linked") {
    return f.value === "true"
      ? isNotNull(productCategories.cloverCategoryId)
      : isNull(productCategories.cloverCategoryId);
  }
  return columnResolver({ name: productCategories.name })(f);
}

/** Sortable keys match the DataTable column keys (see modifier-groups-table.tsx). */
export type ModifierGroupSortColumn = "name" | "status" | "order" | "synced";

const MODIFIER_GROUP_SORT_COL = {
  name: modifierGroups.name,
  status: modifierGroups.active,
  order: modifierGroups.sortOrder,
  synced: modifierGroups.cloverLastSyncedAt,
} as const;

function resolveModifierGroupFacet(f: FilterCondition) {
  if (f.field === "active") return eq(modifierGroups.active, f.value === "true");
  if (f.field === "showByDefault") return eq(modifierGroups.showByDefault, f.value === "true");
  if (f.field === "linked") {
    return f.value === "true"
      ? isNotNull(modifierGroups.cloverModifierGroupId)
      : isNull(modifierGroups.cloverModifierGroupId);
  }
  return columnResolver({ name: modifierGroups.name })(f);
}

/** Sortable keys match the DataTable column keys (see tax-rates-table.tsx). */
export type TaxRateSortColumn = "name" | "rate" | "status" | "synced";

const TAX_RATE_SORT_COL = {
  name: taxRates.name,
  rate: taxRates.rate,
  status: taxRates.active,
  synced: taxRates.cloverLastSyncedAt,
} as const;

function resolveTaxRateFacet(f: FilterCondition) {
  if (f.field === "active") return eq(taxRates.active, f.value === "true");
  if (f.field === "isDefault") return eq(taxRates.isDefault, f.value === "true");
  if (f.field === "linked") {
    return f.value === "true"
      ? isNotNull(taxRates.cloverTaxRateId)
      : isNull(taxRates.cloverTaxRateId);
  }
  return columnResolver({ name: taxRates.name })(f);
}

/** Sortable keys match the DataTable column keys (see printer-labels-table.tsx). */
export type PrinterLabelSortColumn = "name" | "status" | "synced";

const PRINTER_LABEL_SORT_COL = {
  name: printerLabels.name,
  status: printerLabels.active,
  synced: printerLabels.cloverLastSyncedAt,
} as const;

function resolvePrinterLabelFacet(f: FilterCondition) {
  if (f.field === "active") return eq(printerLabels.active, f.value === "true");
  if (f.field === "showInReporting") {
    return eq(printerLabels.showInReporting, f.value === "true");
  }
  if (f.field === "linked") {
    return f.value === "true"
      ? isNotNull(printerLabels.cloverTagId)
      : isNull(printerLabels.cloverTagId);
  }
  return columnResolver({ name: printerLabels.name })(f);
}

export type TaxRateListRow = {
  publicId: string;
  name: string;
  /** Percent, e.g. 13. Null for flat-amount taxes. */
  rate: number | null;
  /** Flat tax in cents. Null for percentage taxes. */
  taxAmount: number | null;
  taxType: string | null;
  isDefault: boolean;
  active: boolean;
  cloverTaxRateId: string | null;
  cloverLastSyncedAt: number | null;
};

export type PrinterLabelListRow = {
  publicId: string;
  name: string;
  showInReporting: boolean;
  active: boolean;
  cloverTagId: string | null;
  cloverLastSyncedAt: number | null;
};

/** The four Clover M:N relations an item can carry. */
export const ASSOCIATION_KINDS = [
  "categories",
  "modifierGroups",
  "taxRates",
  "printerLabels",
] as const;
export type AssociationKind = (typeof ASSOCIATION_KINDS)[number];

export type AssociationRef = {
  publicId: string;
  name: string;
  /** Clover's own id — shown in the table like Clover's own form does. */
  cloverId: string | null;
  /** Secondary column: tax rate, modifier count, reporting flag… */
  detail: string | null;
};

export type ProductAssociations = Record<AssociationKind, AssociationRef[]>;

/** Percent or flat cents, whichever Clover populated. */
function taxRateDetail(rate: string | null, taxAmount: number | null): string {
  if (rate != null) return `${Number(Number(rate).toFixed(5))}%`;
  if (taxAmount != null) return `$${(taxAmount / 100).toFixed(2)}`;
  return "—";
}

export type CategoryListRow = {
  publicId: string;
  name: string;
  active: boolean;
  sortOrder: number;
  colorCode: string | null;
  cloverCategoryId: string | null;
  cloverLastSyncedAt: number | null;
};

export type ModifierGroupListRow = {
  publicId: string;
  name: string;
  alternateName: string | null;
  active: boolean;
  showByDefault: boolean;
  sortOrder: number;
  minRequired: number | null;
  maxAllowed: number | null;
  modifierCount: number;
  cloverModifierGroupId: string | null;
  cloverLastSyncedAt: number | null;
};

export type MenuSectionItemDetail = {
  productPublicId: string;
  name: string;
  active: boolean;
  cloverItemId: string | null;
  sortOrder: number;
};

export type MenuSectionDetail = {
  publicId: string;
  sortOrder: number;
  categoryPublicId: string;
  categoryName: string;
  categoryActive: boolean;
  categoryColorCode: string | null;
  cloverCategoryId: string | null;
  items: MenuSectionItemDetail[];
};

export type MenuDetail = {
  publicId: string;
  name: string;
  sortOrder: number;
  active: boolean;
  cloverMenuId: string | null;
  cloverLastSyncedAt: number | null;
  sections: MenuSectionDetail[];
};


export type MenuSaveResult = {
  menu: MenuDetail;
  pushedCategories: CloverCategoryPushResult | null;
};

class ProductCategoriesService extends SessionUpdatableService<typeof productCategories> {
  constructor(protected readonly repo: typeof productCategoriesRepository) {
    super(repo);
  }

  async listAll(): Promise<ProductCategoryRow[]> {
    return this.repo.findAll().then((rows) =>
      [...rows].sort((a, b) =>
        a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder,
      ),
    );
  }

  /** Admin list — same facets + page + sort contract as Products/Menus. */
  async query(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<CategorySortColumn> = { column: "order", dir: "asc" },
  ): Promise<Page<CategoryListRow>> {
    const where = conditionToSql(condition, resolveCategoryFacet);
    const col = CATEGORY_SORT_COL[sort.column] ?? productCategories.sortOrder;

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          publicId: productCategories.publicId,
          name: productCategories.name,
          active: productCategories.active,
          sortOrder: productCategories.sortOrder,
          colorCode: productCategories.colorCode,
          cloverCategoryId: productCategories.cloverCategoryId,
          cloverLastSyncedAt: productCategories.cloverLastSyncedAt,
        })
        .from(productCategories)
        .where(where)
        .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(productCategories)
        .where(where),
    ]);

    return { items, page: page.page, size: page.size, total: count };
  }

  async listActiveOrdered(): Promise<ProductCategoryRow[]> {
    return db
      .select()
      .from(productCategories)
      .where(eq(productCategories.active, true))
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
  }
}

class ModifierGroupsService extends SessionUpdatableService<typeof modifierGroups> {
  constructor(protected readonly repo: typeof modifierGroupsRepository) {
    super(repo);
  }

  async listAll(): Promise<ModifierGroupRow[]> {
    return this.repo.findAll().then((rows) =>
      [...rows].sort((a, b) =>
        a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder,
      ),
    );
  }

  /** Admin list — same facets + page + sort contract as Products/Menus. */
  async query(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<ModifierGroupSortColumn> = { column: "order", dir: "asc" },
  ): Promise<Page<ModifierGroupListRow>> {
    const where = conditionToSql(condition, resolveModifierGroupFacet);
    const col = MODIFIER_GROUP_SORT_COL[sort.column] ?? modifierGroups.sortOrder;

    const [rows, [{ count }]] = await Promise.all([
      db
        .select({
          id: modifierGroups.id,
          publicId: modifierGroups.publicId,
          name: modifierGroups.name,
          alternateName: modifierGroups.alternateName,
          active: modifierGroups.active,
          showByDefault: modifierGroups.showByDefault,
          sortOrder: modifierGroups.sortOrder,
          minRequired: modifierGroups.minRequired,
          maxAllowed: modifierGroups.maxAllowed,
          cloverModifierGroupId: modifierGroups.cloverModifierGroupId,
          cloverLastSyncedAt: modifierGroups.cloverLastSyncedAt,
        })
        .from(modifierGroups)
        .where(where)
        .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(modifierGroups)
        .where(where),
    ]);

    // Counted with a grouped query over just this page's ids rather than a
    // correlated subquery — one extra round trip, and the result is something
    // you can read off the query instead of trusting template interpolation.
    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const grouped = await db
        .select({ groupId: modifiers.modifierGroupId, n: sql<number>`cast(count(*) as int)` })
        .from(modifiers)
        .where(inArray(modifiers.modifierGroupId, ids))
        .groupBy(modifiers.modifierGroupId);
      for (const g of grouped) counts.set(String(g.groupId), g.n);
    }

    const items = rows.map(({ id, ...rest }) => ({
      ...rest,
      modifierCount: counts.get(String(id)) ?? 0,
    }));

    return { items, page: page.page, size: page.size, total: count };
  }

  async listWithModifiers(): Promise<
    Array<ModifierGroupRow & { modifiers: ModifierRow[] }>
  > {
    const groups = await this.listAll();
    const allMods = await modifiersRepository.findAll();
    const byGroup = new Map<string, ModifierRow[]>();
    for (const m of allMods) {
      const key = String(m.modifierGroupId);
      const list = byGroup.get(key) ?? [];
      list.push(m);
      byGroup.set(key, list);
    }
    return groups.map((g) => ({
      ...g,
      modifiers: (byGroup.get(String(g.id)) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }
}

class ModifiersService extends SessionUpdatableService<typeof modifiers> {
  constructor(protected readonly repo: typeof modifiersRepository) {
    super(repo);
  }
}

class DiscountsService extends SessionUpdatableService<typeof discounts> {
  constructor(protected readonly repo: typeof discountsRepository) {
    super(repo);
  }

  async listAll(): Promise<DiscountRow[]> {
    return this.repo.findAll().then((rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name)));
  }

  /**
   * Everything a customer could redeem: published offers and coded coupons.
   * Checkout resolves against this, so a staff or comp discount synced from
   * Clover is never in the set to begin with.
   */
  async listRedeemable(): Promise<DiscountRow[]> {
    const rows = await this.listAll();
    return rows.filter((r) => r.active && (r.publicOffer || r.couponCode));
  }

  /** Just the ones to show as pick-one options — codes stay unlisted. */
  async listPublicOffers(): Promise<DiscountRow[]> {
    const rows = await this.listAll();
    return rows.filter((r) => r.active && r.publicOffer);
  }
}

class TaxRatesService extends SessionUpdatableService<typeof taxRates> {
  constructor(protected readonly repo: typeof taxRatesRepository) {
    super(repo);
  }

  async query(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<TaxRateSortColumn> = { column: "name", dir: "asc" },
  ): Promise<Page<TaxRateListRow>> {
    const where = conditionToSql(condition, resolveTaxRateFacet);
    const col = TAX_RATE_SORT_COL[sort.column] ?? taxRates.name;

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          publicId: taxRates.publicId,
          name: taxRates.name,
          rate: taxRates.rate,
          taxAmount: taxRates.taxAmount,
          taxType: taxRates.taxType,
          isDefault: taxRates.isDefault,
          active: taxRates.active,
          cloverTaxRateId: taxRates.cloverTaxRateId,
          cloverLastSyncedAt: taxRates.cloverLastSyncedAt,
        })
        .from(taxRates)
        .where(where)
        .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
        .limit(page.size)
        .offset(page.page * page.size),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(taxRates).where(where),
    ]);

    return {
      items: items.map((r) => ({ ...r, rate: r.rate == null ? null : Number(r.rate) })),
      page: page.page,
      size: page.size,
      total: count,
    };
  }
}

class PrinterLabelsService extends SessionUpdatableService<typeof printerLabels> {
  constructor(protected readonly repo: typeof printerLabelsRepository) {
    super(repo);
  }

  async query(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<PrinterLabelSortColumn> = { column: "name", dir: "asc" },
  ): Promise<Page<PrinterLabelListRow>> {
    const where = conditionToSql(condition, resolvePrinterLabelFacet);
    const col = PRINTER_LABEL_SORT_COL[sort.column] ?? printerLabels.name;

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          publicId: printerLabels.publicId,
          name: printerLabels.name,
          showInReporting: printerLabels.showInReporting,
          active: printerLabels.active,
          cloverTagId: printerLabels.cloverTagId,
          cloverLastSyncedAt: printerLabels.cloverLastSyncedAt,
        })
        .from(printerLabels)
        .where(where)
        .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
        .limit(page.size)
        .offset(page.page * page.size),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(printerLabels).where(where),
    ]);

    return { items, page: page.page, size: page.size, total: count };
  }
}

class MenusService extends SessionUpdatableService<typeof menus> {
  constructor(protected readonly repo: typeof menusRepository) {
    super(repo);
  }

  async listAll(): Promise<MenuRow[]> {
    return this.repo.findAll().then((rows) =>
      [...rows].sort((a, b) =>
        a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder,
      ),
    );
  }


  /** Admin list — Orders/Products pattern (facets + page + sort). */
  async queryMenus(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<MenuSortColumn> = { column: "order", dir: "asc" },
  ): Promise<Page<MenuListRow>> {
    const where = conditionToSql(condition, resolveMenuFacet);
    const col = MENU_SORT_COL[sort.column] ?? menus.sortOrder;
    const itemCount = sql<number>`cast((
      select count(*)::int from ${menuItems}
      where ${menuItems.menuId} = ${menus.id}
    ) as int)`;

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          publicId: menus.publicId,
          name: menus.name,
          active: menus.active,
          sortOrder: menus.sortOrder,
          itemCount,
          providerIds: menus.cloverProviderIds,
          cloverPublishedAt: menus.cloverPublishedAt,
          cloverLastSyncedAt: menus.cloverLastSyncedAt,
        })
        .from(menus)
        .where(where)
        .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(menus)
        .where(where),
    ]);

    return {
      items: items.map(({ providerIds, ...row }) => ({
        ...row,
        channel: providerIds?.length ? providerIds.join(", ") : null,
      })),
      page: page.page,
      size: page.size,
      total: count,
    };
  }

  /** One menu plus its item list — the prices that channel charges. */
  async menuWithItems(publicId: string): Promise<{
    menu: MenuRow;
    items: Array<{
      publicId: string;
      productPublicId: string;
      name: string;
      price: number;
      basePrice: number | null;
      enabled: boolean;
    }>;
  }> {
    const menu = await menusRepository.findByPublicId(publicId);
    if (!menu) throw new NotFoundError(`Menu not found: ${publicId}`);
    const rows = await db
      .select({
        publicId: menuItems.publicId,
        productPublicId: products.publicId,
        name: products.name,
        price: menuItems.price,
        basePrice: menuItems.basePrice,
        enabled: menuItems.enabled,
      })
      .from(menuItems)
      .innerJoin(products, eq(menuItems.productId, products.id))
      .where(eq(menuItems.menuId, menu.id))
      .orderBy(asc(products.name));
    return {
      menu,
      items: rows.map((r) => ({
        ...r,
        price: Number(r.price),
        basePrice: r.basePrice == null ? null : Number(r.basePrice),
      })),
    };
  }

  /** Detail for list→open→edit (Orders/Products pattern). */

}

class MenuSectionsService extends SessionUpdatableService<typeof menuSections> {
  constructor(protected readonly repo: typeof menuSectionsRepository) {
    super(repo);
  }
}

/**
 * Facade for Clover catalog entities (categories, modifiers, menus, discounts).
 * All writes go through SessionUpdatableService → UpdatableRepository (+ audit_log).
 */
class InventoryCatalogService {
  readonly categories = new ProductCategoriesService(productCategoriesRepository);
  readonly modifierGroups = new ModifierGroupsService(modifierGroupsRepository);
  readonly modifiers = new ModifiersService(modifiersRepository);
  readonly discounts = new DiscountsService(discountsRepository);
  readonly taxRates = new TaxRatesService(taxRatesRepository);
  readonly printerLabels = new PrinterLabelsService(printerLabelsRepository);
  readonly menus = new MenusService(menusRepository);
  readonly menuSections = new MenuSectionsService(menuSectionsRepository);

  private async requireCloverClient() {
    const client = await createCloverClient();
    if (!client) {
      throw new ValidationError(
        "Clover is not connected. Install the plugin under Settings → Integrations, then connect a merchant under Settings → Clover.",
      );
    }
    return client;
  }

  /** Pull categories, modifier groups, discounts, and Register menu layout from Clover. */
  async pullFromClover(): Promise<CloverCatalogPullResult> {
    const client = await this.requireCloverClient();
    const result = await cloverCatalogSyncService.pull(client);
    await recordAudit({
      entity: "inventory",
      entityPublicId: "bulk",
      operation: "update",
      changes: { _action: "clover_catalog_pull", result },
      createdBy: await currentUserId(),
    });
    return result;
  }

  /** Push linked categories to Clover (create/update). */
  async pushCategories(publicIds?: string[]): Promise<CloverCategoryPushResult> {
    const client = await this.requireCloverClient();
    const result = await cloverCatalogSyncService.pushCategories(client, { publicIds });
    await recordAudit({
      entity: "inventory",
      entityPublicId: "bulk",
      operation: "update",
      changes: {
        _action: "clover_catalog_push",
        publicIds: publicIds ?? null,
        result,
      },
      createdBy: await currentUserId(),
    });
    return result;
  }

  /**
   * Save menu fields + section membership/order.
   * Mirrors section sortOrder onto product_categories (Register layout SoT),
   * optionally pushes those categories to Clover.
   */

  /**
   * Edit a category, then push it to Clover in the same call.
   *
   * Write-through is the point: Clover is the source of truth, so a local-only
   * edit is a lie with a countdown on it — the next pull overwrites it. A push
   * that fails is reported rather than swallowed, because the row now disagrees
   * with the POS and someone has to know.
   */
  async updateCategory(
    publicId: string,
    input: CategoryEditInput,
  ): Promise<{ pushed: CloverCategoryPushResult | null }> {
    await this.categories.update(publicId, {
      name: input.name,
      sortOrder: input.sortOrder,
      colorCode: input.colorCode ?? null,
      active: input.active,
    });

    const pushed = (await createCloverClient())
      ? await this.pushCategories([publicId])
      : null;

    await recordAudit({
      entity: "inventory",
      entityPublicId: publicId,
      operation: "update",
      changes: { _action: "category_edit", ...input, pushed },
      createdBy: await currentUserId(),
    });
    return { pushed };
  }

  /** Edit a modifier group, then push it to Clover. See updateCategory. */
  async updateModifierGroup(
    publicId: string,
    input: ModifierGroupEditInput,
  ): Promise<{ pushed: CloverCategoryPushResult | null }> {
    await this.modifierGroups.update(publicId, {
      name: input.name,
      alternateName: input.alternateName ?? null,
      minRequired: input.minRequired ?? null,
      maxAllowed: input.maxAllowed ?? null,
      showByDefault: input.showByDefault,
      sortOrder: input.sortOrder,
      active: input.active,
    });

    const client = await createCloverClient();
    const pushed = client
      ? await cloverCatalogSyncService.pushModifierGroups(client, { publicIds: [publicId] })
      : null;

    await recordAudit({
      entity: "inventory",
      entityPublicId: publicId,
      operation: "update",
      changes: { _action: "modifier_group_edit", ...input, pushed },
      createdBy: await currentUserId(),
    });
    return { pushed };
  }

  /** Categories available to add as menu sections. */

  /**
   * Clover's category layout for the public menu: active categories in Clover's
   * own sortOrder, each holding its items in the order Clover puts them.
   *
   * Returns product publicIds rather than rows — the menu page already loads
   * every product, so this only has to answer "which, and in what order".
   * Empty when the catalog has never been synced; callers fall back.
   */
  async publicMenuSections(): Promise<
    Array<{ publicId: string; name: string; sortOrder: number; colorCode: string | null; productIds: string[] }>
  > {
    const rows = await db
      .select({
        publicId: productCategories.publicId,
        name: productCategories.name,
        sortOrder: productCategories.sortOrder,
        colorCode: productCategories.colorCode,
        productPublicId: products.publicId,
      })
      .from(productCategoryItems)
      .innerJoin(productCategories, eq(productCategoryItems.categoryId, productCategories.id))
      .innerJoin(products, eq(productCategoryItems.productId, products.id))
      .where(eq(productCategories.active, true))
      .orderBy(
        asc(productCategories.sortOrder),
        asc(productCategories.name),
        asc(productCategoryItems.sortOrder),
        asc(products.name),
      );

    const sections = new Map<
      string,
      { publicId: string; name: string; sortOrder: number; colorCode: string | null; productIds: string[] }
    >();
    for (const row of rows) {
      let section = sections.get(row.publicId);
      if (!section) {
        section = {
          publicId: row.publicId,
          name: row.name,
          sortOrder: row.sortOrder,
          colorCode: row.colorCode,
          productIds: [],
        };
        sections.set(row.publicId, section);
      }
      section.productIds.push(row.productPublicId);
    }
    return [...sections.values()];
  }

  async associationsForProductPublicId(publicId: string): Promise<ProductAssociations> {
    const product = await productsRepository.findByPublicId(publicId);
    if (!product) throw new NotFoundError("Product not found");
    return this.associationsForProduct(product.id);
  }

  /** Everything currently linked to one product, per relation. */
  async associationsForProduct(productId: bigint): Promise<ProductAssociations> {
    const [cats, groups, taxes, labels] = await Promise.all([
      db
        .select({
          publicId: productCategories.publicId,
          name: productCategories.name,
          cloverId: productCategories.cloverCategoryId,
          colorCode: productCategories.colorCode,
        })
        .from(productCategoryItems)
        .innerJoin(productCategories, eq(productCategoryItems.categoryId, productCategories.id))
        .where(eq(productCategoryItems.productId, productId))
        .orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
      db
        .select({
          publicId: modifierGroups.publicId,
          name: modifierGroups.name,
          cloverId: modifierGroups.cloverModifierGroupId,
          minRequired: modifierGroups.minRequired,
          maxAllowed: modifierGroups.maxAllowed,
        })
        .from(productModifierGroups)
        .innerJoin(modifierGroups, eq(productModifierGroups.modifierGroupId, modifierGroups.id))
        .where(eq(productModifierGroups.productId, productId))
        .orderBy(asc(modifierGroups.sortOrder), asc(modifierGroups.name)),
      db
        .select({
          publicId: taxRates.publicId,
          name: taxRates.name,
          cloverId: taxRates.cloverTaxRateId,
          rate: taxRates.rate,
          taxAmount: taxRates.taxAmount,
        })
        .from(productTaxRates)
        .innerJoin(taxRates, eq(productTaxRates.taxRateId, taxRates.id))
        .where(eq(productTaxRates.productId, productId))
        .orderBy(asc(taxRates.name)),
      db
        .select({
          publicId: printerLabels.publicId,
          name: printerLabels.name,
          cloverId: printerLabels.cloverTagId,
          showInReporting: printerLabels.showInReporting,
        })
        .from(productPrinterLabels)
        .innerJoin(printerLabels, eq(productPrinterLabels.printerLabelId, printerLabels.id))
        .where(eq(productPrinterLabels.productId, productId))
        .orderBy(asc(printerLabels.name)),
    ]);

    return {
      categories: cats.map((c) => ({
        publicId: c.publicId,
        name: c.name,
        cloverId: c.cloverId,
        detail: c.colorCode,
      })),
      modifierGroups: groups.map((g) => ({
        publicId: g.publicId,
        name: g.name,
        cloverId: g.cloverId,
        detail:
          g.minRequired == null && g.maxAllowed == null
            ? null
            : `${g.minRequired ?? 0}–${g.maxAllowed ?? "∞"}`,
      })),
      taxRates: taxes.map((t) => ({
        publicId: t.publicId,
        name: t.name,
        cloverId: t.cloverId,
        detail: taxRateDetail(t.rate, t.taxAmount),
      })),
      printerLabels: labels.map((l) => ({
        publicId: l.publicId,
        name: l.name,
        cloverId: l.cloverId,
        detail: l.showInReporting ? "In reporting" : null,
      })),
    };
  }

  /** Active rows of every relation — the pool the Assign dialogs pick from. */
  async associationOptions(): Promise<ProductAssociations> {
    const [cats, groups, taxes, labels] = await Promise.all([
      db
        .select()
        .from(productCategories)
        .where(eq(productCategories.active, true))
        .orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
      db
        .select()
        .from(modifierGroups)
        .where(eq(modifierGroups.active, true))
        .orderBy(asc(modifierGroups.sortOrder), asc(modifierGroups.name)),
      db.select().from(taxRates).where(eq(taxRates.active, true)).orderBy(asc(taxRates.name)),
      db
        .select()
        .from(printerLabels)
        .where(eq(printerLabels.active, true))
        .orderBy(asc(printerLabels.name)),
    ]);

    return {
      categories: cats.map((c) => ({
        publicId: c.publicId,
        name: c.name,
        cloverId: c.cloverCategoryId,
        detail: c.colorCode,
      })),
      modifierGroups: groups.map((g) => ({
        publicId: g.publicId,
        name: g.name,
        cloverId: g.cloverModifierGroupId,
        detail:
          g.minRequired == null && g.maxAllowed == null
            ? null
            : `${g.minRequired ?? 0}–${g.maxAllowed ?? "∞"}`,
      })),
      taxRates: taxes.map((t) => ({
        publicId: t.publicId,
        name: t.name,
        cloverId: t.cloverTaxRateId,
        detail: taxRateDetail(t.rate, t.taxAmount),
      })),
      printerLabels: labels.map((l) => ({
        publicId: l.publicId,
        name: l.name,
        cloverId: l.cloverTagId,
        detail: l.showInReporting ? "In reporting" : null,
      })),
    };
  }

  /**
   * Replace one relation's membership for a product, then mirror the diff into
   * Clover. Clover is inventory SoT, so a local-only edit would be silently
   * reverted by the next pull — when the merchant is connected and the item is
   * linked we push, and report per-row failures instead of throwing.
   */
  async setProductAssociations(
    productPublicId: string,
    kind: AssociationKind,
    publicIds: string[],
  ): Promise<{ pushed: { errors: Array<{ publicId: string; message: string }> } | null }> {
    const product = await productsRepository.findByPublicId(productPublicId);
    if (!product) throw new NotFoundError("Product not found");

    const wanted = new Set(publicIds);
    const current = (await this.associationsForProduct(product.id))[kind];
    const currentIds = new Set(current.map((r) => r.publicId));
    const added = publicIds.filter((id) => !currentIds.has(id));
    const removed = current.filter((r) => !wanted.has(r.publicId));

    if (!added.length && !removed.length) return { pushed: null };

    // Resolve each touched row once — the local write needs the internal id and
    // the Clover push needs the Clover id.
    const targets = await this.internalIdsFor(kind, [
      ...new Set([...added, ...removed.map((r) => r.publicId)]),
    ]);

    for (const publicId of added) {
      const t = targets.get(publicId);
      if (!t) throw new ValidationError(`Unknown ${kind} ${publicId}`);
      await this.linkLocal(kind, product.id, t.id);
    }
    for (const ref of removed) {
      const t = targets.get(ref.publicId);
      if (!t) continue;
      await this.unlinkLocal(kind, product.id, t.id);
    }

    let pushed: { errors: Array<{ publicId: string; message: string }> } | null = null;
    const client = product.cloverItemId ? await createCloverClient() : null;
    if (client && product.cloverItemId) {
      const errors: Array<{ publicId: string; message: string }> = [];
      for (const publicId of added) {
        const cloverId = targets.get(publicId)?.cloverId;
        if (!cloverId) continue;
        try {
          await this.pushLink(client, kind, cloverId, product.cloverItemId, true);
        } catch (e) {
          errors.push({ publicId, message: e instanceof Error ? e.message : String(e) });
        }
      }
      for (const ref of removed) {
        const cloverId = targets.get(ref.publicId)?.cloverId;
        if (!cloverId) continue;
        try {
          await this.pushLink(client, kind, cloverId, product.cloverItemId, false);
        } catch (e) {
          errors.push({ publicId: ref.publicId, message: e instanceof Error ? e.message : String(e) });
        }
      }
      pushed = { errors };
    }

    await recordAudit({
      entity: "product",
      entityPublicId: productPublicId,
      operation: "update",
      changes: { _action: "associations", kind, added, removed: removed.map((r) => r.publicId), pushed },
      createdBy: await currentUserId(),
    });

    return { pushed };
  }

  private async internalIdsFor(
    kind: AssociationKind,
    publicIds: string[],
  ): Promise<Map<string, { id: bigint; cloverId: string | null }>> {
    const out = new Map<string, { id: bigint; cloverId: string | null }>();
    if (!publicIds.length) return out;
    if (kind === "categories") {
      for (const r of await db
        .select()
        .from(productCategories)
        .where(inArray(productCategories.publicId, publicIds))) {
        out.set(r.publicId, { id: r.id, cloverId: r.cloverCategoryId });
      }
    } else if (kind === "modifierGroups") {
      for (const r of await db
        .select()
        .from(modifierGroups)
        .where(inArray(modifierGroups.publicId, publicIds))) {
        out.set(r.publicId, { id: r.id, cloverId: r.cloverModifierGroupId });
      }
    } else if (kind === "taxRates") {
      for (const r of await db.select().from(taxRates).where(inArray(taxRates.publicId, publicIds))) {
        out.set(r.publicId, { id: r.id, cloverId: r.cloverTaxRateId });
      }
    } else {
      for (const r of await db
        .select()
        .from(printerLabels)
        .where(inArray(printerLabels.publicId, publicIds))) {
        out.set(r.publicId, { id: r.id, cloverId: r.cloverTagId });
      }
    }
    return out;
  }

  private async linkLocal(kind: AssociationKind, productId: bigint, targetId: bigint) {
    if (kind === "categories") {
      const existing = await productCategoryItemsRepository.findByCategoryAndProduct(targetId, productId);
      if (!existing) {
        await productCategoryItemsRepository.create({ categoryId: targetId, productId, sortOrder: 0 });
      }
      return;
    }
    if (kind === "modifierGroups") {
      const existing = await productModifierGroupsRepository.findByProductAndGroup(productId, targetId);
      if (!existing) {
        await productModifierGroupsRepository.create({ productId, modifierGroupId: targetId });
      }
      return;
    }
    if (kind === "taxRates") {
      const existing = await productTaxRatesRepository.findByProductAndTaxRate(productId, targetId);
      if (!existing) await productTaxRatesRepository.create({ productId, taxRateId: targetId });
      return;
    }
    const existing = await productPrinterLabelsRepository.findByProductAndLabel(productId, targetId);
    if (!existing) {
      await productPrinterLabelsRepository.create({ productId, printerLabelId: targetId });
    }
  }

  private async unlinkLocal(kind: AssociationKind, productId: bigint, targetId: bigint) {
    if (kind === "categories") {
      await productCategoryItemsRepository.deleteByCategoryAndProduct(targetId, productId);
      return;
    }
    if (kind === "modifierGroups") {
      await productModifierGroupsRepository.deleteByProductAndGroup(productId, targetId);
      return;
    }
    if (kind === "taxRates") {
      await productTaxRatesRepository.deleteByProductAndTaxRate(productId, targetId);
      return;
    }
    await productPrinterLabelsRepository.deleteByProductAndLabel(productId, targetId);
  }

  private async pushLink(
    client: CloverApiClient,
    kind: AssociationKind,
    cloverTargetId: string,
    cloverItemId: string,
    link: boolean,
  ) {
    if (kind === "categories") {
      return link
        ? client.associateCategoryItem(cloverTargetId, cloverItemId)
        : client.dissociateCategoryItem(cloverTargetId, cloverItemId);
    }
    if (kind === "modifierGroups") {
      return link
        ? client.associateItemModifierGroup(cloverTargetId, cloverItemId)
        : client.dissociateItemModifierGroup(cloverTargetId, cloverItemId);
    }
    if (kind === "taxRates") {
      return link
        ? client.associateTaxRateItem(cloverTargetId, cloverItemId)
        : client.dissociateTaxRateItem(cloverTargetId, cloverItemId);
    }
    return link
      ? client.associateTagItem(cloverTargetId, cloverItemId)
      : client.dissociateTagItem(cloverTargetId, cloverItemId);
  }
}

export const inventoryCatalogService = new InventoryCatalogService();
