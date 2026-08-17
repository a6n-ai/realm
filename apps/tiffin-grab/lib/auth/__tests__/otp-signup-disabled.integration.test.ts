import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

const sent = vi.hoisted(() => [] as { email: string; type: string; otp: string }[]);
vi.mock("@/lib/auth/security-events", () => ({
  sendAuthOtp: async (email: string, otp: string, type: string) => {
    sent.push({ email, type, otp });
  },
  sendVerification: async () => {},
  notifyPasswordChanged: async () => {},
  notifyNewLoginIfNewDevice: async () => {},
}));

const { db } = await import("@/db/client");
const { users, verification } = await import("@/db/schema");
const { auth } = await import("@/lib/auth");

const MARK = "otp-gate";
const KNOWN = `${MARK}-known@example.test`;
const STRANGER = `${MARK}-stranger@example.test`;

beforeEach(async () => {
  sent.length = 0;
  await db.insert(users).values({ email: KNOWN, name: "Known Customer", role: "user" });
});

afterEach(async () => {
  await db.delete(users).where(like(users.email, `%${MARK}%`));
  await db.delete(verification).where(like(verification.identifier, `%${MARK}%`));
});

/**
 * Accounts here are provisioned by checkout or an admin. Email-OTP sign-in
 * defaults to creating one for any address that can receive a code, which
 * would let a stranger self-register a customer. Deleting `disableSignUp`
 * from lib/auth must turn this red.
 */
describe("email OTP sign-in does not self-register", () => {
  it("mails nothing to an address with no account", async () => {
    await auth.api.sendVerificationOTP({ body: { email: STRANGER, type: "sign-in" } });

    expect(sent).toEqual([]);
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, STRANGER));
    expect(row).toBeUndefined();
  });

  it("refuses better-auth's own /sign-up/email, which the app never calls", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: STRANGER, password: "a-long-enough-password", name: "Stranger" },
      }),
    ).rejects.toThrow();

    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, STRANGER));
    expect(row).toBeUndefined();
  });

  it("still signs an existing account in with the code it was mailed", async () => {
    await auth.api.sendVerificationOTP({ body: { email: KNOWN, type: "sign-in" } });
    expect(sent).toHaveLength(1);

    const result = await auth.api.signInEmailOTP({ body: { email: KNOWN, otp: sent[0].otp } });
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe(KNOWN);
  });
});
