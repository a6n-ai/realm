import { stripCreateOnly } from "@realm/database";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { ClientScopedRepository } from "@/lib/services/client-scoped-repository";

export type ProductRow = typeof products.$inferSelect;

/**
 * Product DAO — extends shared {@link UpdatableRepository} with Clover / catalog
 * lookups used by ProductsService + inventory sync.
 */
export class ProductsRepository extends ClientScopedRepository<typeof products> {
  async findAll(): Promise<ProductRow[]> {
    return this.db.select().from(products).where(await this.scope());
  }

  // Every lookup below is org-scoped: each franchise has its own Clover
  // merchant connection, so a sync run must only ever see, dedupe against, or
  // match its own franchise's products — never another franchise's, even
  // though Clover item ids/slugs happen to share one Postgres table.
  async findByPublicIds(publicIds: string[]): Promise<ProductRow[]> {
    if (publicIds.length === 0) return [];
    const scope = await this.scope();
    return this.db
      .select()
      .from(products)
      .where(scope ? and(inArray(products.publicId, publicIds), scope) : inArray(products.publicId, publicIds));
  }

  async findByCloverItemId(cloverItemId: string): Promise<ProductRow | null> {
    const scope = await this.scope();
    const base = and(eq(products.cloverItemId, cloverItemId), isNotNull(products.cloverItemId));
    const [row] = await this.db
      .select()
      .from(products)
      .where(scope ? and(base, scope) : base)
      .limit(1);
    return row ?? null;
  }

  async listLinkedCloverItemIds(): Promise<string[]> {
    const scope = await this.scope();
    const rows = await this.db
      .select({ cloverItemId: products.cloverItemId })
      .from(products)
      .where(scope ? and(isNotNull(products.cloverItemId), scope) : isNotNull(products.cloverItemId));
    return rows.map((r) => r.cloverItemId).filter((id): id is string => !!id);
  }

  async listSlugs(): Promise<string[]> {
    const rows = await this.db.select({ slug: products.slug }).from(products).where(await this.scope());
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
  products.organizationId,
);
