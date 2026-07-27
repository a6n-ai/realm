import { UpdatableRepository, stripCreateOnly } from "@realm/database";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema";

export type EmployeeRow = typeof employees.$inferSelect;

export class EmployeesRepository extends UpdatableRepository<typeof employees> {
  async findAll(): Promise<EmployeeRow[]> {
    return this.db.select().from(employees);
  }

  async findActive(): Promise<EmployeeRow[]> {
    return this.db.select().from(employees).where(eq(employees.active, true));
  }

  async findByCloverEmployeeId(cloverEmployeeId: string): Promise<EmployeeRow | null> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.cloverEmployeeId, cloverEmployeeId),
          isNotNull(employees.cloverEmployeeId),
        ),
      )
      .limit(1);
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
);
