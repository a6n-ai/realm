import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { carts, orders, users } from "@/db/schema";
import {
  cartItemsSchema,
  markCartConverted,
  purgeStaleCarts,
  upsertCart,
} from "../carts.service";

const MARK = "carts-service";
const cartIds: bigint[] = [];
const orderIds: bigint[] = [];
const userIds: bigint[] = [];

async function seedUser(suffix: string) {
  const [row] = await db
    .insert(users)
    .values({ email: `${MARK}-${suffix}@example.test`, name: MARK, role: "user", status: "active" })
    .returning({ id: users.id });
  userIds.push(row.id);
  return row.id;
}

function line(id: string, qty = 1) {
  return { productPublicId: id, name: "Pani puri", price: 9.5, category: "snacks", quantity: qty, modifiers: [] };
}

/** Minimal real order row — carts.convertedOrderId FKs to orders.id. */
async function seedOrder() {
  const [row] = await db
    .insert(orders)
    .values({
      customerName: MARK,
      customerEmail: `${MARK}-order@example.test`,
      customerPhone: "+14165550123",
      subtotal: "9.50",
      total: "9.50",
      pricingSnapshot: { currency: "CAD", lines: [], subtotal: 9.5, tax: 0, total: 9.5 },
    })
    .returning({ id: orders.id });
  orderIds.push(row.id);
  return row.id;
}

afterEach(async () => {
  if (cartIds.length) {
    await db.delete(carts).where(inArray(carts.id, cartIds));
    cartIds.length = 0;
  }
  await db.delete(carts).where(like(carts.email, `${MARK}%`));
  if (orderIds.length) {
    await db.delete(orders).where(inArray(orders.id, orderIds));
    orderIds.length = 0;
  }
  if (userIds.length) {
    await db.delete(users).where(inArray(users.id, userIds));
    userIds.length = 0;
  }
});

async function track(publicId: string) {
  const [row] = await db.select().from(carts).where(eq(carts.publicId, publicId)).limit(1);
  cartIds.push(row.id);
  return row;
}

describe("upsertCart", () => {
  it("inserts on a null publicId and returns the new id", async () => {
    const { publicId } = await upsertCart({
      publicId: null,
      items: [line("prd_a")],
      userId: null,
      email: `${MARK}-a@example.test`,
    });
    const row = await track(publicId);
    expect(row.items).toHaveLength(1);
    expect(row.email).toBe(`${MARK}-a@example.test`);
    expect(row.lastActivityAt).toBeGreaterThan(0);
  });

  it("updates in place when the publicId is known, bumping lastActivityAt", async () => {
    const first = await upsertCart({ publicId: null, items: [line("prd_a")], userId: null, email: null });
    const before = await track(first.publicId);
    const second = await upsertCart({
      publicId: first.publicId,
      items: [line("prd_a", 3), line("prd_b")],
      userId: null,
      email: null,
    });
    expect(second.publicId).toBe(first.publicId);
    const [after] = await db.select().from(carts).where(eq(carts.publicId, first.publicId)).limit(1);
    expect(after.id).toBe(before.id);
    expect(after.items).toHaveLength(2);
    expect(after.lastActivityAt).toBeGreaterThanOrEqual(before.lastActivityAt);
  });

  it("lowercases the email", async () => {
    const { publicId } = await upsertCart({
      publicId: null,
      items: [line("prd_a")],
      userId: null,
      email: `${MARK}-MiXeD@Example.test`,
    });
    const row = await track(publicId);
    expect(row.email).toBe(`${MARK}-mixed@example.test`);
  });

  it("never clears a known email with a later null", async () => {
    const first = await upsertCart({ publicId: null, items: [line("prd_a")], userId: null, email: `${MARK}-keep@example.test` });
    await track(first.publicId);
    await upsertCart({ publicId: first.publicId, items: [line("prd_a")], userId: null, email: null });
    const [row] = await db.select().from(carts).where(eq(carts.publicId, first.publicId)).limit(1);
    expect(row.email).toBe(`${MARK}-keep@example.test`);
  });

  it("treats an unknown publicId as a new cart rather than trusting it", async () => {
    const { publicId } = await upsertCart({
      publicId: "crt_notarealid1",
      items: [line("prd_a")],
      userId: null,
      email: `${MARK}-untrusted@example.test`,
    });
    expect(publicId).not.toBe("crt_notarealid1");
    await track(publicId);
  });

  it("never clears a known userId with a later null", async () => {
    const userId = await seedUser("sticky");
    const first = await upsertCart({ publicId: null, items: [line("prd_a")], userId, email: null });
    await track(first.publicId);
    await upsertCart({ publicId: first.publicId, items: [line("prd_a")], userId: null, email: null });
    const [row] = await db.select().from(carts).where(eq(carts.publicId, first.publicId)).limit(1);
    expect(row.userId).toBe(userId);
  });
});

describe("cartItemsSchema", () => {
  it("rejects more lines than the cap", () => {
    const tooMany = Array.from({ length: 41 }, (_, i) => line(`prd_${i}`));
    expect(cartItemsSchema.safeParse(tooMany).success).toBe(false);
  });

  it("rejects a quantity above the cap", () => {
    expect(cartItemsSchema.safeParse([line("prd_a", 51)]).success).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    expect(cartItemsSchema.safeParse([line("prd_a", 0)]).success).toBe(false);
  });

  it("accepts a well-formed cart", () => {
    expect(cartItemsSchema.safeParse([line("prd_a", 2)]).success).toBe(true);
  });
});

describe("purgeStaleCarts", () => {
  it("deletes only carts older than the cutoff", async () => {
    const stale = await upsertCart({ publicId: null, items: [line("prd_a")], userId: null, email: `${MARK}-stale@example.test` });
    const fresh = await upsertCart({ publicId: null, items: [line("prd_b")], userId: null, email: `${MARK}-fresh@example.test` });
    await track(fresh.publicId);
    const staleRow = await track(stale.publicId);
    await db.update(carts).set({ lastActivityAt: Date.now() - 40 * 24 * 60 * 60 * 1000 }).where(eq(carts.id, staleRow.id));

    const deleted = await purgeStaleCarts(Date.now() - 30 * 24 * 60 * 60 * 1000);

    expect(deleted).toBe(1);
    const [gone] = await db.select().from(carts).where(eq(carts.publicId, stale.publicId)).limit(1);
    expect(gone).toBeUndefined();
    const [kept] = await db.select().from(carts).where(eq(carts.publicId, fresh.publicId)).limit(1);
    expect(kept).toBeDefined();
  });
});

describe("markCartConverted", () => {
  it("stamps the order id inside the caller's transaction", async () => {
    const { publicId } = await upsertCart({ publicId: null, items: [line("prd_a")], userId: null, email: null });
    await track(publicId);
    const orderId = await seedOrder();

    await db.transaction(async (tx) => {
      await markCartConverted(tx, publicId, orderId);
    });

    const [after] = await db.select().from(carts).where(eq(carts.publicId, publicId)).limit(1);
    expect(after.convertedOrderId).toBe(orderId);
  });

  it("does not stamp a second order over an already-converted cart", async () => {
    const { publicId } = await upsertCart({ publicId: null, items: [line("prd_a")], userId: null, email: null });
    await track(publicId);
    const firstOrderId = await seedOrder();
    const secondOrderId = await seedOrder();

    await db.transaction(async (tx) => {
      await markCartConverted(tx, publicId, firstOrderId);
    });
    await db.transaction(async (tx) => {
      await markCartConverted(tx, publicId, secondOrderId);
    });

    const [after] = await db.select().from(carts).where(eq(carts.publicId, publicId)).limit(1);
    expect(after.convertedOrderId).toBe(firstOrderId);
  });
});
