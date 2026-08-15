import { UpdatableRepository } from "@realm/database";
import { asc, eq } from "drizzle-orm";
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

  async findStatusById(id: bigint): Promise<{ status: string } | null> {
    const [row] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }
}

export const usersRepository = new UsersRepository(db, users, users.publicId, users.id);
