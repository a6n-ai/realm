import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like as sqlLike } from "drizzle-orm";
import { like } from "@foundry/commons/model/condition";
import { db } from "@/db/client";
import { notificationPrefs, orders, users } from "@/db/schema";
import { getCustomerDetail, listCustomersPage } from "@/lib/services/customers.service";

const MARK = "cust-list";
const PAGE = { page: 0, size: 50 };

const ids: Record<string, bigint> = {};

async function customer(key: string, role: "user" | "admin" = "user") {
  const [row] = await db
    .insert(users)
    .values({ email: `${MARK}-${key}@example.test`, name: `${MARK} ${key}`, role, status: "active" })
    .returning({ id: users.id, publicId: users.publicId });
  ids[key] = row.id;
  return row;
}

async function order(userId: bigint, status: "pending" | "paid" | "fulfilled", total: string) {
  await db.insert(orders).values({
    userId,
    status,
    customerName: `${MARK} buyer`,
    customerEmail: `${MARK}-buyer@example.test`,
    customerPhone: "+14165550100",
    subtotal: total,
    total,
    pricingSnapshot: { lines: [], subtotal: Number(total), tax: 0, total: Number(total) } as never,
  });
}

beforeEach(async () => {
  await customer("staff", "admin");
});

afterEach(async () => {
  await db.delete(orders).where(sqlLike(orders.customerEmail, `%${MARK}%`));
  const marked = Object.values(ids);
  if (marked.length) await db.delete(notificationPrefs).where(inArray(notificationPrefs.userId, marked));
  await db.delete(users).where(sqlLike(users.email, `%${MARK}%`));
  for (const k of Object.keys(ids)) delete ids[k];
});

// A search facet scoped to this test's marker keeps the assertions independent
// of whatever else lives in the local database.
const mine = like("name", `%${MARK}%`);

describe("listCustomersPage", () => {
  it("lists customers and leaves staff accounts out", async () => {
    const buyer = await customer("buyer");

    const result = await listCustomersPage(mine, PAGE);

    expect(result.items.map((r) => r.publicId)).toEqual([buyer.publicId]);
    expect(result.total).toBe(1);
  });

  it("counts orders and sums only money that was actually collected", async () => {
    const buyer = await customer("buyer");
    await order(ids.buyer, "paid", "10.00");
    await order(ids.buyer, "fulfilled", "5.50");
    await order(ids.buyer, "pending", "99.00");

    const result = await listCustomersPage(mine, PAGE);
    const row = result.items.find((r) => r.publicId === buyer.publicId);

    expect(row?.orderCount).toBe(3);
    expect(Number(row?.totalSpent)).toBe(15.5);
    expect(row?.lastOrderAt).not.toBeNull();
  });

  it("does not inflate the total when a customer has many orders", async () => {
    await customer("buyer");
    await order(ids.buyer, "paid", "1.00");
    await order(ids.buyer, "paid", "2.00");

    const result = await listCustomersPage(mine, PAGE);

    expect(result.total).toBe(1);
  });
});

describe("getCustomerDetail", () => {
  it("returns the customer with their orders", async () => {
    const buyer = await customer("buyer");
    await order(ids.buyer, "paid", "12.25");

    const detail = await getCustomerDetail(buyer.publicId);

    expect(detail?.orderCount).toBe(1);
    expect(Number(detail?.totalSpent)).toBe(12.25);
    expect(detail?.orders).toHaveLength(1);
  });

  it("refuses to render a staff account as a customer", async () => {
    const [staff] = await db
      .select({ publicId: users.publicId })
      .from(users)
      .where(eq(users.email, `${MARK}-staff@example.test`));

    expect(await getCustomerDetail(staff.publicId)).toBeNull();
  });
});
