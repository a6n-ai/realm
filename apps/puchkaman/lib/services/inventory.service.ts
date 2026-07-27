import { ValidationError } from "@realm/commons";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  discounts,
  menus,
  menuSections,
  modifierGroups,
  modifiers,
  productCategories,
} from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
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
}

export const inventoryCatalogService = new InventoryCatalogService();
