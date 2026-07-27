import { UpdatableRepository, stripCreateOnly } from "@realm/database";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  discounts,
  menus,
  menuSections,
  modifierGroups,
  modifiers,
  productCategories,
  productCategoryItems,
  productModifierGroups,
} from "@/db/schema";

export type ProductCategoryRow = typeof productCategories.$inferSelect;
export type ModifierGroupRow = typeof modifierGroups.$inferSelect;
export type ModifierRow = typeof modifiers.$inferSelect;
export type DiscountRow = typeof discounts.$inferSelect;
export type MenuRow = typeof menus.$inferSelect;
export type MenuSectionRow = typeof menuSections.$inferSelect;
export type ProductCategoryItemRow = typeof productCategoryItems.$inferSelect;
export type ProductModifierGroupRow = typeof productModifierGroups.$inferSelect;

export class ProductCategoriesRepository extends UpdatableRepository<typeof productCategories> {
  async findAll(): Promise<ProductCategoryRow[]> {
    return this.db.select().from(productCategories);
  }

  async findByCloverCategoryId(cloverCategoryId: string): Promise<ProductCategoryRow | null> {
    const [row] = await this.db
      .select()
      .from(productCategories)
      .where(
        and(
          eq(productCategories.cloverCategoryId, cloverCategoryId),
          isNotNull(productCategories.cloverCategoryId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<ProductCategoryRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(productCategories)
      .set(toSet as never)
      .where(eq(productCategories.id, id))
      .returning();
    return (row as ProductCategoryRow) ?? null;
  }
}

export class ModifierGroupsRepository extends UpdatableRepository<typeof modifierGroups> {
  async findAll(): Promise<ModifierGroupRow[]> {
    return this.db.select().from(modifierGroups);
  }

  async findByCloverModifierGroupId(
    cloverModifierGroupId: string,
  ): Promise<ModifierGroupRow | null> {
    const [row] = await this.db
      .select()
      .from(modifierGroups)
      .where(
        and(
          eq(modifierGroups.cloverModifierGroupId, cloverModifierGroupId),
          isNotNull(modifierGroups.cloverModifierGroupId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<ModifierGroupRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(modifierGroups)
      .set(toSet as never)
      .where(eq(modifierGroups.id, id))
      .returning();
    return (row as ModifierGroupRow) ?? null;
  }
}

export class ModifiersRepository extends UpdatableRepository<typeof modifiers> {
  async findAll(): Promise<ModifierRow[]> {
    return this.db.select().from(modifiers);
  }

  async findByGroupId(modifierGroupId: bigint): Promise<ModifierRow[]> {
    return this.db.select().from(modifiers).where(eq(modifiers.modifierGroupId, modifierGroupId));
  }

  async findByCloverModifierId(cloverModifierId: string): Promise<ModifierRow | null> {
    const [row] = await this.db
      .select()
      .from(modifiers)
      .where(and(eq(modifiers.cloverModifierId, cloverModifierId), isNotNull(modifiers.cloverModifierId)))
      .limit(1);
    return row ?? null;
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<ModifierRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(modifiers)
      .set(toSet as never)
      .where(eq(modifiers.id, id))
      .returning();
    return (row as ModifierRow) ?? null;
  }
}

export class DiscountsRepository extends UpdatableRepository<typeof discounts> {
  async findAll(): Promise<DiscountRow[]> {
    return this.db.select().from(discounts);
  }

  async findByCloverDiscountId(cloverDiscountId: string): Promise<DiscountRow | null> {
    const [row] = await this.db
      .select()
      .from(discounts)
      .where(
        and(eq(discounts.cloverDiscountId, cloverDiscountId), isNotNull(discounts.cloverDiscountId)),
      )
      .limit(1);
    return row ?? null;
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<DiscountRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(discounts)
      .set(toSet as never)
      .where(eq(discounts.id, id))
      .returning();
    return (row as DiscountRow) ?? null;
  }
}

export class MenusRepository extends UpdatableRepository<typeof menus> {
  async findAll(): Promise<MenuRow[]> {
    return this.db.select().from(menus);
  }

  async findByName(name: string): Promise<MenuRow | null> {
    const [row] = await this.db.select().from(menus).where(eq(menus.name, name)).limit(1);
    return row ?? null;
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<MenuRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(menus)
      .set(toSet as never)
      .where(eq(menus.id, id))
      .returning();
    return (row as MenuRow) ?? null;
  }
}

export class MenuSectionsRepository extends UpdatableRepository<typeof menuSections> {
  async findByMenuId(menuId: bigint): Promise<MenuSectionRow[]> {
    return this.db.select().from(menuSections).where(eq(menuSections.menuId, menuId));
  }

  async findByMenuAndCategory(
    menuId: bigint,
    categoryId: bigint,
  ): Promise<MenuSectionRow | null> {
    const [row] = await this.db
      .select()
      .from(menuSections)
      .where(and(eq(menuSections.menuId, menuId), eq(menuSections.categoryId, categoryId)))
      .limit(1);
    return row ?? null;
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<MenuSectionRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(menuSections)
      .set(toSet as never)
      .where(eq(menuSections.id, id))
      .returning();
    return (row as MenuSectionRow) ?? null;
  }
}

export class ProductCategoryItemsRepository extends UpdatableRepository<
  typeof productCategoryItems
> {
  async findByCategoryAndProduct(
    categoryId: bigint,
    productId: bigint,
  ): Promise<ProductCategoryItemRow | null> {
    const [row] = await this.db
      .select()
      .from(productCategoryItems)
      .where(
        and(
          eq(productCategoryItems.categoryId, categoryId),
          eq(productCategoryItems.productId, productId),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}

export class ProductModifierGroupsRepository extends UpdatableRepository<
  typeof productModifierGroups
> {
  async findByProductAndGroup(
    productId: bigint,
    modifierGroupId: bigint,
  ): Promise<ProductModifierGroupRow | null> {
    const [row] = await this.db
      .select()
      .from(productModifierGroups)
      .where(
        and(
          eq(productModifierGroups.productId, productId),
          eq(productModifierGroups.modifierGroupId, modifierGroupId),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}

export const productCategoriesRepository = new ProductCategoriesRepository(
  db,
  productCategories,
  productCategories.publicId,
  productCategories.id,
);

export const modifierGroupsRepository = new ModifierGroupsRepository(
  db,
  modifierGroups,
  modifierGroups.publicId,
  modifierGroups.id,
);

export const modifiersRepository = new ModifiersRepository(
  db,
  modifiers,
  modifiers.publicId,
  modifiers.id,
);

export const discountsRepository = new DiscountsRepository(
  db,
  discounts,
  discounts.publicId,
  discounts.id,
);

export const menusRepository = new MenusRepository(db, menus, menus.publicId, menus.id);

export const menuSectionsRepository = new MenuSectionsRepository(
  db,
  menuSections,
  menuSections.publicId,
  menuSections.id,
);

export const productCategoryItemsRepository = new ProductCategoryItemsRepository(
  db,
  productCategoryItems,
  productCategoryItems.publicId,
  productCategoryItems.id,
);

export const productModifierGroupsRepository = new ProductModifierGroupsRepository(
  db,
  productModifierGroups,
  productModifierGroups.publicId,
  productModifierGroups.id,
);
