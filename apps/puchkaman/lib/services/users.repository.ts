import { UpdatableRepository } from "@foundry/database";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export type UserRow = typeof users.$inferSelect;

export class UsersRepository extends UpdatableRepository<typeof users> {
  async findAll(): Promise<UserRow[]> {
    return this.db.select().from(users).orderBy(asc(users.createdAt));
  }

  /**
   * A soft-deleted user's email is tombstoned (see `tombstoneEmail`), so this
   * naturally never matches a deleted row — a rehired employee or returning
   * customer mints a fresh account rather than resurrecting the old one.
   */
  async findByEmail(email: string): Promise<{ id: bigint } | null> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ?? null;
  }

  /** Batch existence check — e.g. cross-referencing a Clover customer list against app accounts, without N+1. */
  async findEmailsIn(emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const rows = await this.db.select({ email: users.email }).from(users).where(inArray(users.email, emails));
    return new Set(rows.map((r) => r.email).filter((e): e is string => !!e));
  }

  async findStatusById(id: bigint): Promise<{ status: string } | null> {
    const [row] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }
}

export const usersRepository = new UsersRepository(db, users, users.publicId, users.id);
