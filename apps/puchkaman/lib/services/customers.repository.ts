import { stripCreateOnly, columnResolver, conditionToSql } from "@foundry/database";
import type { Condition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { and, asc, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { cloverCustomers, organization } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import { ClientScopedRepository } from "@/lib/services/client-scoped-repository";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";

export type CloverCustomerRow = typeof cloverCustomers.$inferSelect;
/** findPage()'s row shape — raw row plus the joined clientCode for the admin listing. */
export type CloverCustomerListRow = CloverCustomerRow & { clientCode: string | null };

export type CloverCustomerSortColumn = "name" | "email" | "customerSince" | "actions";

const SORT_COL = {
  name: cloverCustomers.name,
  email: cloverCustomers.email,
  customerSince: cloverCustomers.customerSince,
  actions: cloverCustomers.customerSince,
} as const;

export class CloverCustomersRepository extends ClientScopedRepository<typeof cloverCustomers> {
  /**
   * Admin listing — hierarchy-aware like Orders/Finance: a franchise sees only
   * its own (+ shared/null) customers, a brand admin sees every franchise's
   * customers combined with a clientCode on each row (see resolveOrgScopeMode).
   * Sync's own lookups (findByCloverCustomerId below) stay franchise-scoped via
   * this.scope() instead — a sync run must never cross franchises even when a
   * brand admin is the one who triggered it.
   */
  async findPage(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<CloverCustomerSortColumn> = { column: "name", dir: "asc" },
  ): Promise<Page<CloverCustomerListRow>> {
    const scopeMode = await resolveOrgScopeMode();
    const scopedWhere = scopeMode.mode === "org" ? await this.scope() : undefined;
    const where = and(
      scopedWhere,
      conditionToSql(
        condition,
        columnResolver({
          name: cloverCustomers.name,
          email: cloverCustomers.email,
          phone: cloverCustomers.phone,
        }),
      ),
    );
    const col = SORT_COL[sort.column] ?? cloverCustomers.name;
    const orderBy = sort.dir === "desc" ? desc(col) : asc(col);

    const [rows, [{ count }]] = await Promise.all([
      this.db
        .select({ row: cloverCustomers, clientCode: organization.clientCode })
        .from(cloverCustomers)
        .leftJoin(organization, eq(cloverCustomers.organizationId, organization.id))
        .where(where)
        .orderBy(orderBy)
        .limit(page.size)
        .offset(page.page * page.size),
      this.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(cloverCustomers)
        .where(where),
    ]);

    return {
      items: rows.map((r) => ({
        ...r.row,
        clientCode: scopeMode.mode === "all" ? r.clientCode : null,
      })),
      page: page.page,
      size: page.size,
      total: count,
    };
  }

  /**
   * Match candidates for "does this app customer already exist in Clover"
   * before pushing a new one — franchise-scoped via this.scope() (not
   * brand-all) since it has to match against the same merchant a push would
   * actually create the customer on.
   */
  async searchForMatch(query: string, limit = 8): Promise<CloverCustomerRow[]> {
    const q = query.trim();
    if (!q) return [];
    const scope = await this.scope();
    const textMatch = or(
      ilike(cloverCustomers.name, `%${q}%`),
      ilike(cloverCustomers.email, `%${q}%`),
      ilike(cloverCustomers.phone, `%${q}%`),
    );
    return this.db
      .select()
      .from(cloverCustomers)
      .where(scope ? and(scope, textMatch) : textMatch)
      .limit(limit);
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
