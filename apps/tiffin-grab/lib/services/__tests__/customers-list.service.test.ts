import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createCustomer, listCustomersPage } = await import("../customers.service");
const { like: cLike } = await import("@foundry/commons/model/condition");

// Unique-name isolation (memory: realm-integration-test-isolation) — parallel
// live-DB service tests share the `users` table, so scope every assertion to
// this file's own name prefix instead of wiping/counting the whole table.
const PREFIX = "ZzPageCust";
const PHONES = ["+16475554010", "+16475554011", "+16475554012"];

async function cleanup() {
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.phone, PHONES));
  for (const r of rows) {
    await db.delete(account).where(eq(account.userId, r.id));
    await db.delete(users).where(eq(users.id, r.id));
  }
}

describe("listCustomersPage", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("paginates with a total and filters by Condition, scoped to this test's rows", async () => {
    await createCustomer({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName: `${PREFIX} Alice`, phone: PHONES[0] }, {});
    await createCustomer({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName: `${PREFIX} Bob`, phone: PHONES[1] }, {});

    const scope = cLike("name", `${PREFIX}%`);

    const firstPage = await listCustomersPage(scope, { page: 0, size: 1 });
    expect(firstPage.items.length).toBe(1);
    expect(firstPage.total).toBe(2);
    expect(firstPage.items[0].joined).toBe(false);
    expect(firstPage.size).toBe(1);

    const secondPage = await listCustomersPage(scope, { page: 1, size: 1 });
    expect(secondPage.items.length).toBe(1);
    expect(secondPage.items[0].publicId).not.toBe(firstPage.items[0].publicId);

    const none = await listCustomersPage(cLike("name", `${PREFIX}Nope%`), { page: 0, size: 10 });
    expect(none.total).toBe(0);
    expect(none.items.length).toBe(0);
  });

  it("sends totalPaid only when withPayments is set", async () => {
    await createCustomer({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName: `${PREFIX} Carol`, phone: PHONES[2] }, {});
    const scope = cLike("name", `${PREFIX} Carol%`);

    const hidden = await listCustomersPage(scope, { page: 0, size: 5 });
    expect(hidden.items[0].totalPaid).toBeNull();

    const shown = await listCustomersPage(scope, { page: 0, size: 5 }, undefined, undefined, { withPayments: true });
    expect(shown.items[0].totalPaid).toBe("0");
  });

  it("paid sort falls back to latest order without finance:read", async () => {
    const scope = cLike("name", `${PREFIX}%`);
    const sort = { column: "paid" as const, dir: "asc" as const };
    const hidden = await listCustomersPage(scope, { page: 0, size: 50 }, sort);
    const latest = await listCustomersPage(scope, { page: 0, size: 50 }, { column: "latestOrder", dir: "asc" });
    expect(hidden.items.map((r) => r.publicId)).toEqual(latest.items.map((r) => r.publicId));
  });
});
