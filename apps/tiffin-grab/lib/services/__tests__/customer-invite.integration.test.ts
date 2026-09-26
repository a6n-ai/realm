import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

// Real better-auth + DB: sendCustomerInvite -> magic link -> outbox row, then
// the emailed link signs the customer in and lands on /me. Only the Next
// request scope is stubbed.
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }),
}));

const { db } = await import("@/db/client");
const { account, notificationOutbox, session, users } = await import("@/db/schema");
const { auth } = await import("@/lib/auth");
const { createCustomer, sendCustomerInvite } = await import("../customers.service");

const EMAIL = "customer-invite-it@example.test";
const PHONES = ["+16475554090"];

async function cleanup() {
  await db.delete(notificationOutbox).where(eq(notificationOutbox.recipientEmail, EMAIL));
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.phone, PHONES));
  for (const r of rows) {
    await db.delete(session).where(eq(session.userId, r.id));
    await db.delete(account).where(eq(account.userId, r.id));
    await db.delete(users).where(eq(users.id, r.id));
  }
}

describe("sendCustomerInvite", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("mails a welcome link that signs the customer straight into /me, once", async () => {
    await createCustomer({ email: EMAIL, fullName: "Invite Cust", phone: PHONES[0] }, {});
    await sendCustomerInvite(EMAIL);

    const [row] = await db
      .select({ event: notificationOutbox.event, payload: notificationOutbox.payload })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientEmail, EMAIL));
    expect(row.event).toBe("customer_invitation");
    const url = (row.payload as { vars: { url: string } }).vars.url;

    const res = await auth.handler(new Request(url));
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/me");
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(true);
    const [u] = await db.select({ emailVerified: users.emailVerified }).from(users).where(eq(users.email, EMAIL));
    expect(u.emailVerified).toBe(true);

    const replay = await auth.handler(new Request(url));
    expect(replay.headers.get("location")).toContain("error=INVALID_TOKEN");
  });

  it("refuses an address that isn't a customer account", async () => {
    await expect(sendCustomerInvite("nobody-customer-invite-it@example.test")).rejects.toThrow("Customer not found");
  });
});
