import { ValidationError } from "@realm/commons";
import { UpdatableService } from "@realm/database";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  discounts,
  menus,
  menuSections,
  modifierGroups,
  modifiers,
  productCategories,
  users,
} from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
import { getSession } from "@/lib/auth/session";
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

async function sessionActorId(): Promise<bigint | null> {
  try {
    const session = await getSession();
    const publicId = session?.user?.id;
    if (!publicId) return null;
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

class ProductCategoriesService extends UpdatableService<typeof productCategories> {
  constructor(protected readonly repo: typeof productCategoriesRepository) {
    super(repo);
  }

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
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

class ModifierGroupsService extends UpdatableService<typeof modifierGroups> {
  constructor(protected readonly repo: typeof modifierGroupsRepository) {
    super(repo);
  }

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
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

class ModifiersService extends UpdatableService<typeof modifiers> {
  constructor(protected readonly repo: typeof modifiersRepository) {
    super(repo);
  }

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }
}

class DiscountsService extends UpdatableService<typeof discounts> {
  constructor(protected readonly repo: typeof discountsRepository) {
    super(repo);
  }

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async listAll(): Promise<DiscountRow[]> {
    return this.repo.findAll().then((rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name)));
  }
}

class MenusService extends UpdatableService<typeof menus> {
  constructor(protected readonly repo: typeof menusRepository) {
    super(repo);
  }

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
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

class MenuSectionsService extends UpdatableService<typeof menuSections> {
  constructor(protected readonly repo: typeof menuSectionsRepository) {
    super(repo);
  }

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }
}

/**
 * Facade for Clover catalog entities (categories, modifiers, menus, discounts).
 * All writes go through UpdatableService → UpdatableRepository.
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
    return cloverCatalogSyncService.pull(client);
  }

  /** Push linked categories to Clover (create/update). */
  async pushCategories(publicIds?: string[]): Promise<CloverCategoryPushResult> {
    const client = await this.requireCloverClient();
    return cloverCatalogSyncService.pushCategories(client, { publicIds });
  }
}

export const inventoryCatalogService = new InventoryCatalogService();
