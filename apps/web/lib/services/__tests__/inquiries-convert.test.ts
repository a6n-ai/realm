import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

const session: { user: { id: string } | null } = { user: null };
vi.mock("@/lib/auth", () => ({ auth: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users);
}

describe("inquiriesService.convert", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates an order, links it, and marks converted", async () => {
    const snap = await loadCatalogSnapshot();
    const meal = snap.mealSizes[0];
    const plan = snap.plans[0];
    const [staff] = await db
      .insert(users)
      .values({ name: "Agent Staff", role: "member" })
      .returning({ publicId: users.publicId });
    session.user = { id: staff.publicId };
    const inq = await inquiriesService.create({ fullName: "Lead D", phone: "+16475551200", source: "google" });
    const { deploymentId } = await inquiriesService.convert(inq.publicId, {
      planKey: plan.key,
      selections: {
        mealSizeId: meal.publicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        isStudent: false,
        durationWeeks: 1,
      },
      contact: { fullName: "Lead D", phone: "+16475551200", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.stage).toBe("converted");
    expect(row.convertedOrderId).not.toBeNull();
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(row.convertedOrderId).toBe(order.id);
    expect(order.publicId).toMatch(/^ord_/);
    expect(order.createdBy).not.toBeNull();
    const acts = await inquiriesService.listActivities(inq.publicId);
    expect(acts.some((a) => a.type === "converted")).toBe(true);
  });
});
