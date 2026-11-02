import { afterAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { ownerPool, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { defaultOwner } = await import("../default-owner");
const { resetPoolCache, poolFor } = await import("../owner-pool.service");

const seeded: bigint[] = [];
async function seed(role: "admin" | "member" | "user") {
  const [u] = await db
    .insert(users)
    .values({ email: `do${Math.random().toString(36).slice(2)}@test.invalid`, name: `DO ${role}`, role })
    .returning({ id: users.id });
  seeded.push(u.id);
  return u.id;
}

describe("defaultOwner", () => {
  afterAll(async () => {
    await db.delete(ownerPool).where(inArray(ownerPool.userId, seeded));
    await resetPoolCache();
    await db.delete(users).where(inArray(users.id, seeded));
  });

  it("gives the record to the staff member acting", async () => {
    const staff = await seed("member");
    expect(await defaultOwner(staff, "order")).toBe(staff);
  });

  it("never gives it to a customer: a customer checkout goes to the default pool", async () => {
    const customer = await seed("user");
    const poolMember = await seed("member");
    await db.insert(ownerPool).values({ entity: "inquiry", userId: poolMember, sourceId: null, weight: 1 });
    await resetPoolCache();
    const owner = await defaultOwner(customer, "order");
    expect(owner).not.toBe(customer);
    expect(owner).not.toBeNull();
  });

  it("pools are per entity: orders draw from the Orders pool, never the inquiry pool, and tickets from the Tickets pool", async () => {
    const customer = await seed("user");
    const inquiryMember = await seed("member");
    const orderMember = await seed("member");
    const ticketMember = await seed("member");
    await db.delete(ownerPool).where(inArray(ownerPool.userId, seeded));
    await db.insert(ownerPool).values([
      { entity: "inquiry", userId: inquiryMember, weight: 1 },
      { entity: "order", userId: orderMember, weight: 1 },
      { entity: "ticket", userId: ticketMember, weight: 1 },
    ]);
    await resetPoolCache();
    expect(await defaultOwner(customer, "order")).toBe(orderMember);
    expect(await defaultOwner(customer, "ticket")).toBe(ticketMember);
    expect(await poolFor("inquiry")).toEqual(expect.arrayContaining([expect.objectContaining({ id: inquiryMember })]));
    expect((await poolFor("inquiry")).some((m) => m.id === orderMember || m.id === ticketMember)).toBe(false);
    expect((await poolFor("order")).some((m) => m.id === inquiryMember)).toBe(false);
  });

  it("an order falls back to the default inquiry pool when the Orders pool is empty", async () => {
    const customer = await seed("user");
    const inquiryMember = await seed("member");
    await db.delete(ownerPool).where(inArray(ownerPool.userId, seeded));
    await db.insert(ownerPool).values({ entity: "inquiry", userId: inquiryMember, weight: 1 });
    await resetPoolCache();
    const owner = await defaultOwner(customer, "order");
    expect((await poolFor("inquiry")).map((m) => m.id)).toContain(owner);
  });
});
