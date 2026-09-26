import { db } from '@foundry/crm'; // adjust import as appropriate for your DB instance
import { eq } from 'drizzle-orm';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';

/** Generic CRUD repository */
export abstract class AbstractRepository<T extends { id: bigint }> {
  protected constructor(protected table: PgTableWithColumns<any>) {}

  async list(): Promise<T[]> {
    return db.select().from(this.table).execute();
  }

  async getById(id: bigint): Promise<T | undefined> {
    const rows = await db.select().from(this.table).where(eq(this.table.id, id)).limit(1).execute();
    return rows[0] as T | undefined;
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    const [row] = await db.insert(this.table).values(data as any).returning().execute();
    return row as T;
  }

  async update(id: bigint, data: Partial<Omit<T, 'id'>>): Promise<void> {
    await db.update(this.table).set(data as any).where(eq(this.table.id, id)).execute();
  }

  async delete(id: bigint): Promise<void> {
    await db.delete(this.table).where(eq(this.table.id, id)).execute();
  }
}
