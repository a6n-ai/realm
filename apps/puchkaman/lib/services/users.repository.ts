import { UpdatableRepository } from "@realm/database";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export type UserRow = typeof users.$inferSelect;

export class UsersRepository extends UpdatableRepository<typeof users> {
  async findAll(): Promise<UserRow[]> {
    return this.db.select().from(users).orderBy(asc(users.createdAt));
  }
}

export const usersRepository = new UsersRepository(db, users, users.publicId, users.id);
