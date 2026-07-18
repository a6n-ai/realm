import { asc, eq } from "drizzle-orm";
import { UpdatableRepository, UpdatableService } from "@realm/database";
import { db } from "@/db/client";
import { products, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { productSchema } from "@/lib/products/schema";

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
}

const repo = new UpdatableRepository(db, products, products.publicId, products.id);
export const productsService = new ProductsService(repo);
