import type { Condition, Page, PageRequest } from "@realm/commons";
import { DEFAULT_PAGE } from "@realm/commons";
import { asc, desc, eq, getTableName, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { resolveColumn, toDrizzleWhere } from "./condition";
import { stripCreateOnly } from "./managed-fields";
import type { Database } from "./types";

export class BaseRepository<TTable extends PgTable> {
  constructor(
    protected readonly db: Database,
    protected readonly table: TTable,
    protected readonly publicIdColumn: PgColumn,
    protected readonly internalIdColumn: PgColumn,
  ) {}

  get tableName(): string {
    return getTableName(this.table);
  }

  async create(values: Record<string, unknown>, actorId?: bigint | null): Promise<TTable["$inferSelect"]> {
    const toInsert = actorId ? { ...values, createdBy: actorId } : values;
    // Generic base over PgTable: Drizzle's insert typing can't see the concrete shape here.
    const [row] = await this.db.insert(this.table).values(toInsert as never).returning();
    return row as TTable["$inferSelect"];
  }

  async findByPublicId(publicId: string): Promise<TTable["$inferSelect"] | null> {
    const [row] = await this.db.select().from(this.table as PgTable).where(eq(this.publicIdColumn, publicId)).limit(1);
    return (row as TTable["$inferSelect"]) ?? null;
  }

  async findById(internalId: bigint): Promise<TTable["$inferSelect"] | null> {
    const [row] = await this.db.select().from(this.table as PgTable).where(eq(this.internalIdColumn, internalId)).limit(1);
    return (row as TTable["$inferSelect"]) ?? null;
  }

  async findMany(condition?: Condition, page: PageRequest = DEFAULT_PAGE): Promise<Page<TTable["$inferSelect"]>> {
    const where = toDrizzleWhere(this.table, condition);
    const orderColumn = page.sort ? resolveColumn(this.table, page.sort.field) : this.internalIdColumn;
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

  async deleteByPublicId(publicId: string): Promise<number> {
    const result = await this.db
      .delete(this.table)
      .where(eq(this.publicIdColumn, publicId))
      .returning({ id: this.internalIdColumn });
    return result.length;
  }
}

export class UpdatableRepository<TTable extends PgTable> extends BaseRepository<TTable> {
  async updateByPublicId(
    publicId: string,
    patch: Record<string, unknown>,
    actorId?: bigint | null,
  ): Promise<TTable["$inferSelect"] | null> {
    const safePatch = stripCreateOnly(patch);
    const toSet = actorId ? { ...safePatch, updatedBy: actorId } : safePatch;
    const [row] = await this.db
      .update(this.table)
      .set(toSet as never)
      .where(eq(this.publicIdColumn, publicId))
      .returning();
    return (row as TTable["$inferSelect"]) ?? null;
  }
}
