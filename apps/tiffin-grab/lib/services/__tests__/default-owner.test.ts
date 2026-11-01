import { afterAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiryUserConfig, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { defaultOwner } = await import("../default-owner");
const { resetPoolCache } = await import("../inquiry-user-config.service");

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
    await db.delete(inquiryUserConfig).where(inArray(inquiryUserConfig.userId, seeded));
    await resetPoolCache();
    await db.delete(users).where(inArray(users.id, seeded));
  });

  it("gives the record to the staff member acting", async () => {
    const staff = await seed("member");
    expect(await defaultOwner(staff, "test")).toBe(staff);
  });

  it("never gives it to a customer: a customer checkout goes to the default pool", async () => {
    const customer = await seed("user");
    const poolMember = await seed("member");
    await db.insert(inquiryUserConfig).values({ userId: poolMember, sourceId: null, weight: 1 });
    await resetPoolCache();
    const owner = await defaultOwner(customer, "test-pool");
    expect(owner).not.toBe(customer);
    expect(owner).not.toBeNull();
  });
});
