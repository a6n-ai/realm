import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";

// Signup mails a verification link; without this the suite makes a real SES call
// (which fails, is caught, and just logs a stack). Keep it hermetic.
const sendVerificationEmail = vi.fn(async () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { sendVerificationEmail } } }));

const { db } = await import("@/db/client");
const { account, users } = await import("@/db/schema");
const { signUpCustomer } = await import("../actions");

async function reset() { await db.delete(account); await db.delete(users).where(ne(users.isSystem, true)); }

const PASSWORD = "hunter2hunter2";

describe("signUpCustomer", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates a customer + credential account", async () => {
    const r = await signUpCustomer({ phone: "+16475550111", email: "a@example.invalid", password: PASSWORD });
    expect(r.ok).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(u.role).toBe("user");
    expect(u.email).toBe("a@example.invalid");
    const [a] = await db.select().from(account).where(eq(account.userId, u.id));
    expect(a.providerId).toBe("credential");
    expect(a.password).not.toBe(PASSWORD);
    // Not verified yet, and the link was mailed — the account cannot hold a
    // session until that link is clicked.
    expect(u.emailVerified).toBe(false);
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  // Email is the login path, so signing up without one is no longer possible —
  // it used to create a customer reachable by no channel at all.
  it("rejects a signup with no email", async () => {
    const r = await signUpCustomer({ phone: "+16475550113", email: "", password: PASSWORD });
    expect(r.ok).toBe(false);
    const rows = await db.select().from(users).where(eq(users.phone, "+16475550113"));
    expect(rows.length).toBe(0);
  });

  it("rejects a duplicate phone without creating a second user", async () => {
    await signUpCustomer({ phone: "+16475550111", email: "a@example.invalid", password: PASSWORD });
    const r = await signUpCustomer({ phone: "+16475550111", email: "b@example.invalid", password: "another1another1" });
    expect(r.ok).toBe(false);
    const rows = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(rows.length).toBe(1);
  });

  it("rejects a too-short password", async () => {
    const r = await signUpCustomer({ phone: "+16475550112", email: "c@example.invalid", password: "short" });
    expect(r.ok).toBe(false);
  });
});
