import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { users, inquiries, leadSources, orders, payments, orderActivities, inquiryActivities } = await import("@/db/schema");
const { getCustomer360 } = await import("../customers.service");

async function reset() {
  await db.delete(orderActivities);
  await db.delete(inquiryActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(inquiries);
  await db.delete(users);
}

describe("getCustomer360 (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("matches inquiries by case-insensitive email/phone", async () => {
    const [u] = await db.insert(users).values({
      email: "match@example.com", phone: "+16475559999", role: "user",
    }).returning({ publicId: users.publicId });
    const [manual] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, "manual")).limit(1);
    await db.insert(inquiries).values({ fullName: "Match Person", phone: "+16475559999", email: "OTHER@x.com", sourceId: manual.id, stage: "new" });
    await db.insert(inquiries).values({ fullName: "Email Match", phone: "+10000000000", email: "MATCH@example.com", sourceId: manual.id, stage: "new" });
    await db.insert(inquiries).values({ fullName: "No Match", phone: "+19999999999", email: "no@x.com", sourceId: manual.id, stage: "new" });

    const result = await getCustomer360(u.publicId);
    expect(result.profile.email).toBe("match@example.com");
    const names = result.inquiries.map((i) => i.fullName).sort();
    expect(names).toEqual(["Email Match", "Match Person"]);
  });
});
