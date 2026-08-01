// Suspending an account must end the sessions it already has. The login gate
// (session.create.before in lib/auth) only runs when a session is CREATED, so without
// revocation a suspended staff account keeps full CRM access — customer PII, orders,
// payments — until its 30-day session expires. That is the whole point of offboarding.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { account, session, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { usersService } = await import("../users.service");

const P = "revoketest";

async function reset() {
  const mine = await db.select({ id: users.id }).from(users).where(like(users.email, `${P}-%`));
  for (const u of mine) {
    await db.delete(session).where(eq(session.userId, u.id));
    await db.delete(account).where(eq(account.userId, u.id));
  }
  await db.delete(users).where(like(users.email, `${P}-%`));
}

/** A user with two live sessions, as if signed in on a laptop and a phone. */
async function userWithSessions() {
  const [u] = await db
    .insert(users)
    .values({ email: `${P}-${Math.random().toString(36).slice(2)}@test.invalid`, role: "member", status: "active" })
    .returning();
  for (const tag of ["laptop", "phone"]) {
    await db.insert(session).values({
      id: `ses_${tag}_${Math.random().toString(36).slice(2)}`,
      userId: u.id,
      token: `tok_${tag}_${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    });
  }
  return u;
}

const sessionCount = async (userId: bigint) =>
  (await db.select().from(session).where(eq(session.userId, userId))).length;

describe("changing account status revokes sessions", () => {
  beforeEach(reset);
  afterAll(reset);

  for (const status of ["suspended", "inactive"] as const) {
    it(`revokes every session when a user is set ${status}`, async () => {
      const u = await userWithSessions();
      expect(await sessionCount(u.id)).toBe(2);

      await usersService.setStatus(u.publicId, status);

      expect(await sessionCount(u.id)).toBe(0);
      const [after] = await db.select({ status: users.status }).from(users).where(eq(users.id, u.id));
      expect(after.status).toBe(status);
    });
  }

  it("leaves sessions alone when a user is set back to active", async () => {
    const u = await userWithSessions();
    await usersService.setStatus(u.publicId, "active");
    expect(await sessionCount(u.id)).toBe(2);
  });

  it("soft-delete also revokes, and anonymises contact details", async () => {
    const u = await userWithSessions();
    const originalEmail = u.email;
    await usersService.softDelete(u.publicId);

    expect(await sessionCount(u.id)).toBe(0);
    const [after] = await db
      .select({ status: users.status, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, u.id));
    expect(after.status).toBe("deleted");
    // Tombstoned, not nulled: the column is NOT NULL, so nulling it threw a 23502 and
    // soft-delete failed outright. Must stay unique and be unroutable (.invalid).
    expect(after.email).toBe(`deleted-${u.publicId}@deleted.invalid`);
    expect(after.email).not.toBe(originalEmail);
    expect(after.phone).toBeNull();
  });

  it("frees the original address for re-registration after a soft-delete", async () => {
    const u = await userWithSessions();
    const originalEmail = u.email;
    await usersService.softDelete(u.publicId);
    // The unique index must no longer hold the old address.
    const [reused] = await db
      .insert(users)
      .values({ email: originalEmail, role: "user", status: "active" })
      .returning({ id: users.id });
    expect(reused.id).toBeTruthy();
  });

  it("refuses to revoke for a user that does not exist rather than silently no-op", async () => {
    await expect(usersService.revokeSessions("usr_does_not_exist")).rejects.toThrow(/not found/i);
  });
});
