import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";

vi.mock("@/lib/auth/security-events", () => ({
  sendAuthOtp: async () => {},
  sendStaffInvitation: async () => {},
}));

const { db } = await import("@/db/client");
const { account, users } = await import("@/db/schema");
const { auth } = await import("@/lib/auth");

const MARK = "google-link-guard";
const before = auth.options.databaseHooks!.account!.create!.before!;
const ctx = { context: await auth.$context } as never;

async function seed(emailVerified: boolean) {
  const [u] = await db
    .insert(users)
    .values({ email: `${MARK}-${emailVerified}@example.test`, name: "Pre Registered", role: "user", emailVerified })
    .returning({ id: users.id });
  await db.insert(account).values({ userId: u.id, providerId: "credential", accountId: String(u.id), password: "hash-set-by-whoever" });
  return u.id;
}

const credentialCount = async (userId: bigint) =>
  (await db.select({ id: account.id }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, "credential")))).length;

afterEach(async () => {
  await db.delete(users).where(like(users.email, `%${MARK}%`));
});

/**
 * /signup makes an unverified email+password account, and Google links onto
 * unverified accounts (requireLocalEmailVerified: false). Without the guard a
 * stranger could pre-register a victim's address with their own password and
 * the victim's Google sign-in would verify it for them. Removing the guard in
 * lib/auth must turn this red.
 */
describe("Google linking onto an unverified account", () => {
  it("deletes a password nobody proved they own", async () => {
    const userId = await seed(false);
    await before({ providerId: "google", accountId: "g-1", userId: String(userId) } as never, ctx);
    expect(await credentialCount(userId)).toBe(0);
  });

  it("refuses to link an unverified account when the guard cannot run", async () => {
    const userId = await seed(false);
    await expect(before({ providerId: "google", accountId: "g-4", userId: String(userId) } as never, null as never)).rejects.toThrow();
    expect(await credentialCount(userId)).toBe(1);
  });

  it("keeps the password of a verified owner", async () => {
    const userId = await seed(true);
    await before({ providerId: "google", accountId: "g-2", userId: String(userId) } as never, ctx);
    expect(await credentialCount(userId)).toBe(1);
  });

  it("never stores Google's tokens", async () => {
    const userId = await seed(true);
    const out = (await before(
      { providerId: "google", accountId: "g-3", userId: String(userId), accessToken: "a", refreshToken: "r", idToken: "x.e30.y" } as never,
      ctx,
    )) as { data: Record<string, unknown> };
    expect(out.data).toMatchObject({ accessToken: null, refreshToken: null, idToken: null });
  });

  it("a /signup account cannot keep a squatter's password once Google links it", async () => {
    vi.doMock("@/lib/auth/password", async (orig) => orig());
    const { signUpCustomer } = await import("@/app/(auth)/signup/actions");
    const email = `${MARK}-squat@example.test`;
    expect(await signUpCustomer({ email, name: "Squatter", password: "squatter-password-123" })).toEqual({ ok: true });
    const [u] = await db.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.email, email));
    // Typing an address into /signup proves nothing about owning it.
    expect(u!.emailVerified).toBe(false);
    await before({ providerId: "google", accountId: "g-squat", userId: String(u!.id) } as never, ctx);
    expect(await credentialCount(u!.id)).toBe(0);
  });
});
