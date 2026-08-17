import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

// The only side effect worth watching: whether a code was actually mailed.
const sent = vi.hoisted(() => [] as { email: string; type: string; otp: string }[]);
vi.mock("@/lib/auth/security-events", () => ({
  sendAuthOtp: async (email: string, otp: string, type: string) => {
    sent.push({ email, type, otp });
  },
}));

const { db } = await import("@/db/client");
const { users, verification } = await import("@/db/schema");
const { auth } = await import("@/lib/auth");

const MARK = "otp-gate";
const KNOWN = `${MARK}-known@example.test`;
const STRANGER = `${MARK}-stranger@example.test`;

beforeEach(async () => {
  sent.length = 0;
  await db.insert(users).values({ email: KNOWN, name: "Known Customer", role: "user", status: "active" });
});

afterEach(async () => {
  await db.delete(users).where(like(users.email, `%${MARK}%`));
  await db.delete(verification).where(like(verification.identifier, `%${MARK}%`));
});

/**
 * Regression: a stranger's address could request a sign-in code and better-auth
 * would CREATE the account on verify, because emailOTP defaults to sign-up
 * enabled. Deleting `disableSignUp: true` from lib/auth must turn these red.
 */
describe("email OTP sign-in does not self-register", () => {
  it("mails nothing to an address with no account", async () => {
    await auth.api.sendVerificationOTP({ body: { email: STRANGER, type: "sign-in" } });

    expect(sent).toEqual([]);
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, STRANGER));
    expect(row).toBeUndefined();
  });

  it("still mails a code to an existing customer", async () => {
    await auth.api.sendVerificationOTP({ body: { email: KNOWN, type: "sign-in" } });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ email: KNOWN, type: "sign-in" });
    expect(sent[0].otp).toMatch(/^\d{6}$/);
  });

  it("signs an existing customer in with the code that was mailed", async () => {
    await auth.api.sendVerificationOTP({ body: { email: KNOWN, type: "sign-in" } });
    const result = await auth.api.signInEmailOTP({ body: { email: KNOWN, otp: sent[0].otp } });

    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe(KNOWN);
    // The customer role is what routes them to /me rather than the console.
    expect((result.user as { role?: string }).role).toBe("user");
  });

  it("re-sends a fresh code, and the newest one is the one that works", async () => {
    await auth.api.sendVerificationOTP({ body: { email: KNOWN, type: "sign-in" } });
    await auth.api.sendVerificationOTP({ body: { email: KNOWN, type: "sign-in" } });

    expect(sent).toHaveLength(2);
    const result = await auth.api.signInEmailOTP({ body: { email: KNOWN, otp: sent[1].otp } });
    expect(result.token).toBeTruthy();
  });

  it("refuses to sign in an unknown address even with a code in hand", async () => {
    // No verification row can exist for an address that was never sent a code,
    // so the verify call is the second half of the same gate.
    await expect(
      auth.api.signInEmailOTP({ body: { email: STRANGER, otp: "123456" } }),
    ).rejects.toThrow();

    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, STRANGER));
    expect(row).toBeUndefined();
  });
});
