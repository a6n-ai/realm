import { stripCreateOnly } from "@realm/database";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { cloverCustomers } from "@/db/schema";
import { ClientScopedRepository } from "@/lib/services/client-scoped-repository";

export type CloverCustomerRow = typeof cloverCustomers.$inferSelect;

export class CloverCustomersRepository extends ClientScopedRepository<typeof cloverCustomers> {
  async findAll(): Promise<CloverCustomerRow[]> {
    return this.db.select().from(cloverCustomers).where(await this.scope());
  }

  async findByCloverCustomerId(cloverCustomerId: string): Promise<CloverCustomerRow | null> {
    const scope = await this.scope();
    const base = and(
      eq(cloverCustomers.cloverCustomerId, cloverCustomerId),
      isNotNull(cloverCustomers.cloverCustomerId),
    );
    const [row] = await this.db
      .select()
      .from(cloverCustomers)
      .where(scope ? and(base, scope) : base)
      .limit(1);
    return row ?? null;
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<CloverCustomerRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(cloverCustomers)
      .set(toSet as never)
      .where(eq(cloverCustomers.id, id))
      .returning();
    return (row as CloverCustomerRow) ?? null;
  }
}

export const cloverCustomersRepository = new CloverCustomersRepository(
  db,
  cloverCustomers,
  cloverCustomers.publicId,
  cloverCustomers.id,
  cloverCustomers.organizationId,
);
