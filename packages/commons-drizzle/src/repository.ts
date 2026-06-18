import type { Condition, Page, PageRequest } from "@tiffin/commons";
import { DEFAULT_PAGE } from "@tiffin/commons";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { resolveColumn, toDrizzleWhere } from "./condition";
import { stripCreateOnly } from "./managed-fields";
import type { Database } from "./types";

export class BaseRepository<TTable extends PgTable> {
  constructor(
    protected readonly db: Database,
    protected readonly table: TTable,
    protected readonly idColumn: PgColumn,
  ) {}

  async create(values: Record<string, unknown>, actorId?: string | null): Promise<TTable["$inferSelect"]> {
    const toInsert = actorId ? { ...values, createdBy: actorId } : values;
    // Generic base over PgTable: Drizzle's insert typing can't see the concrete shape here.
    const [row] = await this.db.insert(this.table).values(toInsert as never).returning();
    return row as TTable["$inferSelect"];
  }

  async findById(id: string): Promise<TTable["$inferSelect"] | null> {
    const [row] = await this.db.select().from(this.table as PgTable).where(eq(this.idColumn, id)).limit(1);
    return (row as TTable["$inferSelect"]) ?? null;
  }

  async findMany(condition?: Condition, page: PageRequest = DEFAULT_PAGE): Promise<Page<TTable["$inferSelect"]>> {
    const where = toDrizzleWhere(this.table, condition);
    const orderColumn = page.sort ? resolveColumn(this.table, page.sort.field) : this.idColumn;
    const orderBy = page.sort?.dir === "desc" ? desc(orderColumn) : asc(orderColumn);

    const rows = await this.db
      .select()
      .from(this.table as PgTable)
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size);

    const [{ count }] = await this.db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(this.table as PgTable)
      .where(where);

    return { items: rows as TTable["$inferSelect"][], page: page.page, size: page.size, total: count };
  }

  async delete(id: string): Promise<number> {
    const result = await this.db.delete(this.table).where(eq(this.idColumn, id)).returning({ id: this.idColumn });
    return result.length;
  }
}

export class UpdatableRepository<TTable extends PgTable> extends BaseRepository<TTable> {
  async update(id: string, patch: Record<string, unknown>, actorId?: string | null): Promise<TTable["$inferSelect"] | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db.update(this.table).set(toSet as never).where(eq(this.idColumn, id)).returning();
    return (row as TTable["$inferSelect"]) ?? null;
  }
}
