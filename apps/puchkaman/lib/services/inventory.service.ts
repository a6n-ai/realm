import { NotFoundError, ValidationError } from "@realm/commons";
import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { columnResolver, conditionToSql } from "@realm/database";
import { asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  discounts,
  menus,
  menuSections,
  modifierGroups,
  modifiers,
  productCategories,
  productCategoryItems,
  products,
} from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
import type { SortState } from "@/lib/list/sort";
import type { MenuSaveInput } from "@/lib/menus/schema";
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
  productCategoriesRepository,
  type DiscountRow,
  type MenuRow,
  type MenuSectionRow,
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
  sectionCount: number;
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

export type MenuCategoryOption = {
  publicId: string;
  name: string;
  active: boolean;
  colorCode: string | null;
  sortOrder: number;
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

  async listWithSections(): Promise<
    Array<MenuRow & { sections: Array<MenuSectionRow & { categoryName: string | null }> }>
  > {
    const [menuRows, sectionRows, cats] = await Promise.all([
      this.listAll(),
      db.select().from(menuSections),
      productCategoriesRepository.findAll(),
    ]);
    const catName = new Map(cats.map((c) => [String(c.id), c.name]));
    const byMenu = new Map<string, MenuSectionRow[]>();
    for (const s of sectionRows) {
      const key = String(s.menuId);
      const list = byMenu.get(key) ?? [];
      list.push(s);
      byMenu.set(key, list);
    }
    return menuRows.map((m) => ({
      ...m,
      sections: (byMenu.get(String(m.id)) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ ...s, categoryName: catName.get(String(s.categoryId)) ?? null })),
    }));
  }

  /** Admin list — Orders/Products pattern (facets + page + sort). */
  async queryMenus(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<MenuSortColumn> = { column: "order", dir: "asc" },
  ): Promise<Page<MenuListRow>> {
    const where = conditionToSql(condition, resolveMenuFacet);
    const col = MENU_SORT_COL[sort.column] ?? menus.sortOrder;
    const sectionCount = sql<number>`cast((
      select count(*)::int from ${menuSections}
      where ${menuSections.menuId} = ${menus.id}
    ) as int)`;

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          publicId: menus.publicId,
          name: menus.name,
          active: menus.active,
          sortOrder: menus.sortOrder,
          sectionCount,
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

    return { items, page: page.page, size: page.size, total: count };
  }

  /** Detail for list→open→edit (Orders/Products pattern). */
  async getDetail(publicId: string): Promise<MenuDetail> {
    const menu = await this.repo.findByPublicId(publicId);
    if (!menu) throw new NotFoundError(`Menu not found: ${publicId}`);

    const sectionRows = await menuSectionsRepository.findByMenuId(menu.id);
    const cats = await productCategoriesRepository.findAll();
    const catById = new Map(cats.map((c) => [String(c.id), c]));
    const ordered = [...sectionRows].sort((a, b) => a.sortOrder - b.sortOrder);
    const categoryIds = ordered.map((s) => s.categoryId);

    const itemsByCategory = new Map<string, MenuSectionItemDetail[]>();
    if (categoryIds.length > 0) {
      const links = await db
        .select({
          categoryId: productCategoryItems.categoryId,
          sortOrder: productCategoryItems.sortOrder,
          productPublicId: products.publicId,
          name: products.name,
          active: products.active,
          cloverItemId: products.cloverItemId,
        })
        .from(productCategoryItems)
        .innerJoin(products, eq(products.id, productCategoryItems.productId))
        .where(inArray(productCategoryItems.categoryId, categoryIds));

      for (const row of links) {
        const key = String(row.categoryId);
        const list = itemsByCategory.get(key) ?? [];
        list.push({
          productPublicId: row.productPublicId,
          name: row.name,
          active: row.active,
          cloverItemId: row.cloverItemId,
          sortOrder: row.sortOrder,
        });
        itemsByCategory.set(key, list);
      }
      for (const list of itemsByCategory.values()) {
        list.sort((a, b) =>
          a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder,
        );
      }
    }

    return {
      publicId: menu.publicId,
      name: menu.name,
      sortOrder: menu.sortOrder,
      active: menu.active,
      cloverMenuId: menu.cloverMenuId,
      cloverLastSyncedAt: menu.cloverLastSyncedAt,
      sections: ordered.map((s) => {
        const cat = catById.get(String(s.categoryId));
        return {
          publicId: s.publicId,
          sortOrder: s.sortOrder,
          categoryPublicId: cat?.publicId ?? "",
          categoryName: cat?.name ?? "—",
          categoryActive: cat?.active ?? false,
          categoryColorCode: cat?.colorCode ?? null,
          cloverCategoryId: cat?.cloverCategoryId ?? null,
          items: itemsByCategory.get(String(s.categoryId)) ?? [],
        };
      }),
    };
  }

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
  async saveMenu(publicId: string, input: MenuSaveInput): Promise<MenuSaveResult> {
    const menu = await menusRepository.findByPublicId(publicId);
    if (!menu) throw new NotFoundError(`Menu not found: ${publicId}`);

    const seen = new Set<string>();
    for (const s of input.sections) {
      if (seen.has(s.categoryPublicId)) {
        throw new ValidationError(`Duplicate section category: ${s.categoryPublicId}`);
      }
      seen.add(s.categoryPublicId);
    }

    const categories = await Promise.all(
      input.sections.map((s) => productCategoriesRepository.findByPublicId(s.categoryPublicId)),
    );
    for (let i = 0; i < categories.length; i++) {
      if (!categories[i]) {
        throw new ValidationError(`Category not found: ${input.sections[i]!.categoryPublicId}`);
      }
    }

    await this.menus.update(publicId, {
      name: input.name,
      active: input.active,
      sortOrder: input.sortOrder,
    });

    const existing = await menuSectionsRepository.findByMenuId(menu.id);
    const nextCategoryIds = new Set(categories.map((c) => String(c!.id)));
    for (const row of existing) {
      if (!nextCategoryIds.has(String(row.categoryId))) {
        await this.menuSections.delete(row.publicId);
      }
    }

    const categoryPublicIds: string[] = [];
    for (let i = 0; i < input.sections.length; i++) {
      const section = input.sections[i]!;
      const cat = categories[i]!;
      categoryPublicIds.push(cat.publicId);
      const sortOrder = section.sortOrder;

      const prior = await menuSectionsRepository.findByMenuAndCategory(menu.id, cat.id);
      if (prior) {
        if (prior.sortOrder !== sortOrder) {
          await this.menuSections.update(prior.publicId, { sortOrder });
        }
      } else {
        await this.menuSections.create({
          menuId: menu.id,
          categoryId: cat.id,
          sortOrder,
        });
      }

      if (cat.sortOrder !== sortOrder) {
        await this.categories.update(cat.publicId, { sortOrder });
      }
    }

    let pushedCategories: CloverCategoryPushResult | null = null;
    if (input.pushToClover && categoryPublicIds.length > 0) {
      pushedCategories = await this.pushCategories(categoryPublicIds);
    }

    await recordAudit({
      entity: "menus",
      entityPublicId: publicId,
      operation: "update",
      changes: {
        _action: "menu_save",
        name: input.name,
        active: input.active,
        sortOrder: input.sortOrder,
        sectionCount: input.sections.length,
        pushToClover: Boolean(input.pushToClover),
        pushed: pushedCategories,
      },
      createdBy: await currentUserId(),
    });

    return {
      menu: await this.menus.getDetail(publicId),
      pushedCategories,
    };
  }

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
  async listCategoryOptions(): Promise<MenuCategoryOption[]> {
    const rows = await this.categories.listAll();
    return rows.map((c) => ({
      publicId: c.publicId,
      name: c.name,
      active: c.active,
      colorCode: c.colorCode,
      sortOrder: c.sortOrder,
    }));
  }
}

export const inventoryCatalogService = new InventoryCatalogService();
