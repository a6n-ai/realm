import { UpdatableRepository } from "@foundry/database";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export type UserRow = typeof users.$inferSelect;

export class UsersRepository extends UpdatableRepository<typeof users> {
  async findAll(): Promise<UserRow[]> {
    return this.db.select().from(users).orderBy(asc(users.createdAt));
  }

  async findByEmail(email: string): Promise<{ id: bigint } | null> {
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  }
}

export const usersRepository = new UsersRepository(db, users, users.publicId, users.id);
