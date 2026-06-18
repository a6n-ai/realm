import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

const repo = new UpdatableRepository(db, users, users.id);
export const usersService = new SessionUpdatableService(repo);
