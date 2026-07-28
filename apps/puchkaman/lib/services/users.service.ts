import { ValidationError } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { session as sessionTable, users } from "@/db/schema";
import { usersRepository, type UserRow } from "./users.repository";
import { currentUserId, SessionUpdatableService } from "./session-service";

export const USER_STATUSES = ["active", "inactive", "suspended"] as const;
export type UserStatusValue = (typeof USER_STATUSES)[number];

/**
 * Login accounts for the admin app. Distinct from `employees`, which are Clover
 * POS staff synced from the merchant and cannot sign in here.
 */
class UsersService extends SessionUpdatableService<typeof users> {
  constructor(protected readonly repo: typeof usersRepository) {
    super(repo);
  }

  async listAll(): Promise<UserRow[]> {
    return this.repo.findAll();
  }

  /**
   * Suspend / reactivate. Revoking the sessions of a non-active account is what
   * makes this take effect immediately: the sign-in hook stops them getting a
   * NEW session, and the dashboard layout re-checks on read, but deleting the
   * rows ends any open tab in the same request rather than at next navigation.
   */
  async setStatus(publicId: string, status: UserStatusValue): Promise<UserRow> {
    if (!USER_STATUSES.includes(status)) throw new ValidationError("Unknown account status");

    const actorId = await currentUserId();
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);
    if (!target) throw new ValidationError("User not found");
    // Locking yourself out is never the intent, and with one admin it would lock
    // out the whole app.
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot change your own account status.");
    }

    const row = await super.update(publicId, { status });
    if (status !== "active") {
      await db.delete(sessionTable).where(eq(sessionTable.userId, target.id));
    }
    return row;
  }
}

export const usersService = new UsersService(usersRepository);
