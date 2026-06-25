import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createCustomer } = await import("../customers.service");

const PHONE = "+16475553000";

async function cleanup() {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.phone, PHONE));
  for (const r of rows) {
    await db.delete(account).where(eq(account.userId, r.id));
    await db.delete(users).where(eq(users.id, r.id));
  }
}

describe("createCustomer", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("provisions a user + credential account and returns a publicId", async () => {
    const { publicId } = await createCustomer({ fullName: "Walk In", phone: PHONE }, {});
    expect(publicId).toMatch(/^usr_/);
    const [u] = await db.select().from(users).where(eq(users.publicId, publicId));
    expect(u.role).toBe("user");
    const [acc] = await db.select().from(account).where(eq(account.userId, u.id));
    expect(acc.providerId).toBe("credential");
  });

  it("is idempotent by phone — second call returns the same customer", async () => {
    const first = await createCustomer({ fullName: "Walk In", phone: PHONE }, {});
    const second = await createCustomer({ fullName: "Walk In Again", phone: PHONE }, {});
    expect(second.publicId).toBe(first.publicId);
    const n = await db.select({ id: users.id }).from(users).where(eq(users.phone, PHONE));
    expect(n).toHaveLength(1);
  });
});
