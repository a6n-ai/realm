import { Role, type RoleValue, ValidationError } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { session as sessionTable, users } from "@/db/schema";
import { usersRepository, type UserRow } from "./users.repository";
import { currentUserId, SessionUpdatableService } from "./session-service";

export const USER_STATUSES = ["active", "inactive", "suspended", "deleted"] as const;
export type UserStatusValue = (typeof USER_STATUSES)[number];

/**
 * The address a soft-deleted account's email is replaced with. Tombstoned rather than
 * nulled: the column is unique and the real address has to become reusable, while the
 * row itself must survive because orders and payments reference it. `.invalid` is
 * reserved by RFC 2606, so no MTA can ever deliver to it.
 */
export function tombstoneEmail(publicId: string): string {
  return `deleted-${publicId}@deleted.invalid`;
}

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
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);
    if (!target) throw new ValidationError("User not found");
    // Locking yourself out is never the intent, and with one admin it would lock
    // out the whole app.
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot change your own account status.");
    }
    // A soft-deleted row is a tombstone, not a suspended account: its email was
    // already reassigned, so flipping status back to active would resurrect a
    // login for an address that no longer belongs to it. Deletion is final here.
    if (target.status === "deleted") {
      throw new ValidationError("This account has been deleted and cannot be reactivated.");
    }

    const row = await super.update(publicId, { status });
    if (status !== "active") {
      await db.delete(sessionTable).where(eq(sessionTable.userId, target.id));
    }
    return row;
  }

  /**
   * Change a user's role. Refuses on your own row for the same reason setStatus does:
   * demoting the only admin locks the whole app out, and there is no recovery path
   * from the UI.
   */
  async setRole(publicId: string, role: RoleValue): Promise<UserRow> {
    if (role !== Role.ADMIN && role !== Role.MEMBER) {
      throw new ValidationError("Unknown role");
    }
    const actorId = await currentUserId();
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    if (!target) throw new ValidationError("User not found");
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot change your own role.");
    }
    return super.update(publicId, { role });
  }

  /**
   * Soft delete: mark deleted, tombstone the email so the real address frees up, and
   * revoke every session. Business rows are never hard-deleted, which is also why the
   * admin plugin's removeUser endpoint is not exposed.
   */
  async softDelete(publicId: string): Promise<UserRow> {
    const actorId = await currentUserId();
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    if (!target) throw new ValidationError("User not found");
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot remove your own account.");
    }
    const row = await super.update(publicId, {
      status: "deleted",
      email: tombstoneEmail(publicId),
    });
    await db.delete(sessionTable).where(eq(sessionTable.userId, target.id));
    return row;
  }
}

export const usersService = new UsersService(usersRepository);
