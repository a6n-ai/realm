import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { auditLog, customerAddresses, users } = await import("@/db/schema");
const { listCustomerActivitiesPage } = await import("../customer-activities-list.service");

async function reset() {
  await db.delete(auditLog).where(eq(auditLog.entity, "customer_addresses"));
  await db.delete(customerAddresses);
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("listCustomerActivitiesPage (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("lists address changes by staff and by the customer, under the customer, with who did it", async () => {
    const [customer] = await db.insert(users).values({ email: "c@example.com", name: "Cust", role: "user" }).returning();
    const [staff] = await db.insert(users).values({ email: "s@example.com", name: "Staffer", role: "admin" }).returning();
    const [addr] = await db.insert(customerAddresses).values({
      userId: customer.id, label: "Home", addressLine: "1 Main St", city: "Toronto", postalCode: "M5V 2T6", province: "ON",
    }).returning();
    await db.insert(auditLog).values([
      { entity: "customer_addresses", entityPublicId: addr.publicId, operation: "update", changes: { addressLine: { from: "1 Main St", to: "2 Main St" } }, createdBy: staff.id, createdAt: 2000 },
      { entity: "customer_addresses", entityPublicId: addr.publicId, operation: "create", changes: { label: "Home", addressLine: "1 Main St" }, createdBy: customer.id, createdAt: 1000 },
    ]);

    const page = await listCustomerActivitiesPage(undefined, { page: 0, size: 10 });

    expect(page.total).toBe(2);
    expect(page.items.map((r) => [r.actionKey, r.customerEmail, r.by])).toEqual([
      ["address_updated", "c@example.com", "Staffer"],
      ["address_added", "c@example.com", "Customer"],
    ]);
  });
});
