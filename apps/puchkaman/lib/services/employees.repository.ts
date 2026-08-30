import { stripCreateOnly } from "@realm/database";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema";
import { ClientScopedRepository } from "@/lib/services/client-scoped-repository";
import { orgScopeWhereForAdmin } from "@/lib/services/org-scope";

export type EmployeeRow = typeof employees.$inferSelect;

export class EmployeesRepository extends ClientScopedRepository<typeof employees> {
  /** Admin listing — hierarchy-aware (see orgScopeWhereForAdmin), unlike the
   * sync-facing methods below which stay franchise-strict via this.scope(). */
  async findAll(): Promise<EmployeeRow[]> {
    return this.db.select().from(employees).where(await orgScopeWhereForAdmin(employees.organizationId));
  }

  async findActive(): Promise<EmployeeRow[]> {
    const orgScope = await this.scope();
    return this.db.select().from(employees).where(orgScope ? and(eq(employees.active, true), orgScope) : eq(employees.active, true));
  }

  async findByCloverEmployeeId(cloverEmployeeId: string): Promise<EmployeeRow | null> {
    const scope = await this.scope();
    const base = and(eq(employees.cloverEmployeeId, cloverEmployeeId), isNotNull(employees.cloverEmployeeId));
    const [row] = await this.db
      .select()
      .from(employees)
      .where(scope ? and(base, scope) : base)
      .limit(1);
    return row ?? null;
  }

  // Deliberately NOT org-scoped: this guards the employees.userId unique
  // constraint (one employee row per user, system-wide), not a Clover match —
  // scoping it would let the same user get a second employee row in another
  // franchise and only find out at the DB constraint.
  /** Whichever employee (if any) already holds this user_id — the sync's guard against the unique constraint. */
  async findByUserId(userId: bigint): Promise<EmployeeRow | null> {
    const [row] = await this.db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
    return row ?? null;
  }

  async updateByInternalId(
    id: bigint,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<EmployeeRow | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(employees)
      .set(toSet as never)
      .where(eq(employees.id, id))
      .returning();
    return (row as EmployeeRow) ?? null;
  }
}

export const employeesRepository = new EmployeesRepository(
  db,
  employees,
  employees.publicId,
  employees.id,
  employees.organizationId,
);
