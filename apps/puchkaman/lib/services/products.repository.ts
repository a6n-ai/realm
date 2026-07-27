import { UpdatableRepository, stripCreateOnly } from "@realm/database";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";

export type ProductRow = typeof products.$inferSelect;

/**
 * Product DAO — extends shared {@link UpdatableRepository} with Clover / catalog
 * lookups used by ProductsService + inventory sync.
 */
export class ProductsRepository extends UpdatableRepository<typeof products> {
  async findAll(): Promise<ProductRow[]> {
    return this.db.select().from(products);
  }

  async findByPublicIds(publicIds: string[]): Promise<ProductRow[]> {
    if (publicIds.length === 0) return [];
    return this.db.select().from(products).where(inArray(products.publicId, publicIds));
  }

  async findByCloverItemId(cloverItemId: string): Promise<ProductRow | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.cloverItemId, cloverItemId), isNotNull(products.cloverItemId)))
      .limit(1);
    return row ?? null;
  }

  async listLinkedCloverItemIds(): Promise<string[]> {
    const rows = await this.db
      .select({ cloverItemId: products.cloverItemId })
      .from(products)
      .where(isNotNull(products.cloverItemId));
    return rows.map((r) => r.cloverItemId).filter((id): id is string => !!id);
  }

  async listSlugs(): Promise<string[]> {
    const rows = await this.db.select({ slug: products.slug }).from(products);
    return rows.map((r) => r.slug).filter((s): s is string => !!s);
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<ProductRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(products)
      .set(toSet as never)
      .where(eq(products.id, id))
      .returning();
    return (row as ProductRow) ?? null;
  }
}

export const productsRepository = new ProductsRepository(
  db,
  products,
  products.publicId,
  products.id,
);
