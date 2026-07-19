import { asc, eq, sql } from "drizzle-orm";
import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { UpdatableRepository, UpdatableService, columnResolver, conditionToSql } from "@realm/database";
import { db } from "@/db/client";
import { products, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { productSchema } from "@/lib/products/schema";

export type ProductListRow = typeof products.$inferSelect;

// Every filterable facet (category/source/syncStatus/featured/name/slug) lives
// on the base `products` table, so a plain columnResolver suffices — except
// `featured`, whose URL value arrives as the string "true"/"false" (same as
// every other facet) but needs a real boolean to match the column.
function resolveProductFacet(f: FilterCondition) {
  if (f.field === "featured") return eq(products.featured, f.value === "true");
  return columnResolver({
    category: products.category,
    source: products.source,
    syncStatus: products.syncStatus,
    name: products.name,
    slug: products.slug,
  })(f);
}

// session.user.id is the acting user's public_id (usr_…); audit columns are
// bigint. Resolve it to the internal id once per call so create/update stamp
// createdBy/updatedBy correctly (null if no session, e.g. seed scripts).
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

class ProductsService extends UpdatableService<typeof products> {
  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async create(values: Record<string, unknown>) {
    return super.create(productSchema.parse(values));
  }

  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, productSchema.partial().parse(patch));
  }

  // Soft delete: keep the row (order/audit history elsewhere may reference it
  // later) but drop it off the public menu.
  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }

  async listActive() {
    return db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.category), asc(products.name));
  }

  // Admin table view: every product, active or not.
  async listAll() {
    return db.select().from(products).orderBy(asc(products.category), asc(products.name));
  }

  // Server-side faceted filtering + offset pagination for the admin table —
  // mirrors tiffin-grab's listOrdersPage. Named `queryProducts` (not `list`):
  // `list` is already taken by the base UpdatableService method. Every facet
  // resolves against the base `products` table directly (no FK, so no join
  // that could inflate/deflate the count).
  async queryProducts(
    condition: Condition | undefined,
    page: PageRequest,
  ): Promise<Page<ProductListRow>> {
    const where = conditionToSql(condition, resolveProductFacet);

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(products)
        .where(where)
        .orderBy(asc(products.category), asc(products.name))
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(products)
        .where(where),
    ]);

    return { items, page: page.page, size: page.size, total: count };
  }
}

const repo = new UpdatableRepository(db, products, products.publicId, products.id);
export const productsService = new ProductsService(repo);
