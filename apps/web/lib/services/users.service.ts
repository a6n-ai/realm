import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";
import { pickUserWritable } from "./users-writable";

class UsersService extends SessionUpdatableService<typeof users> {
  async create(values: Record<string, unknown>) {
    return super.create(pickUserWritable(values));
  }
  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, pickUserWritable(patch));
  }
}

const repo = new UpdatableRepository(db, users, users.id);
export const usersService = new UsersService(repo);
