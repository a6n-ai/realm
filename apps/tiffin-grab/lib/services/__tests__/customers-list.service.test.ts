import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createCustomer, listCustomersPage } = await import("../customers.service");
const { like: cLike } = await import("@realm/commons/model/condition");

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
    await createCustomer({ fullName: `${PREFIX} Alice`, phone: PHONES[0] }, {});
    await createCustomer({ fullName: `${PREFIX} Bob`, phone: PHONES[1] }, {});

    const scope = cLike("name", `${PREFIX}%`);

    // Page slice: 2 rows, size 1 -> first page has 1 item but total reflects both.
    const firstPage = await listCustomersPage(scope, { page: 0, size: 1 });
    expect(firstPage.items.length).toBe(1);
    expect(firstPage.total).toBe(2);
    expect(firstPage.size).toBe(1);

    const secondPage = await listCustomersPage(scope, { page: 1, size: 1 });
    expect(secondPage.items.length).toBe(1);
    expect(secondPage.items[0].publicId).not.toBe(firstPage.items[0].publicId);

    // A condition that matches none of this scope's rows returns an empty page.
    const none = await listCustomersPage(cLike("name", `${PREFIX}Nope%`), { page: 0, size: 10 });
    expect(none.total).toBe(0);
    expect(none.items.length).toBe(0);
  });
});
