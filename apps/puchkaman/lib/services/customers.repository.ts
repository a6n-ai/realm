import { stripCreateOnly } from "@realm/database";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { cloverCustomers, organization } from "@/db/schema";
import { ClientScopedRepository } from "@/lib/services/client-scoped-repository";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";

export type CloverCustomerRow = typeof cloverCustomers.$inferSelect;
/** findAll()'s row shape — raw row plus the joined clientCode for the admin listing. */
export type CloverCustomerListRow = CloverCustomerRow & { clientCode: string | null };

export class CloverCustomersRepository extends ClientScopedRepository<typeof cloverCustomers> {
  /**
   * Admin listing — hierarchy-aware like Orders/Finance: a franchise sees only
   * its own (+ shared/null) customers, a brand admin sees every franchise's
   * customers combined with a clientCode on each row (see resolveOrgScopeMode).
   * Sync's own lookups (findByCloverCustomerId below) stay franchise-scoped via
   * this.scope() instead — a sync run must never cross franchises even when a
   * brand admin is the one who triggered it.
   */
  async findAll(): Promise<CloverCustomerListRow[]> {
    const scopeMode = await resolveOrgScopeMode();
    const scopedWhere = scopeMode.mode === "org" ? await this.scope() : undefined;
    const rows = await this.db
      .select({ row: cloverCustomers, clientCode: organization.clientCode })
      .from(cloverCustomers)
      .leftJoin(organization, eq(cloverCustomers.organizationId, organization.id))
      .where(scopedWhere);
    return rows.map((r) => ({
      ...r.row,
      clientCode: scopeMode.mode === "all" ? r.clientCode : null,
    }));
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
