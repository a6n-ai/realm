import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

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
    const inq = await inquiriesService.create({ fullName: "Lead D", phone: "+16475551200", source: "google" });
    const { deploymentId } = await inquiriesService.convert(inq.id, {
      planKey: plan.key,
      selections: {
        mealSizeId: meal.id,
        frequencyKey: "5_day",
        dailyQty: 1,
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
    const acts = await inquiriesService.listActivities(inq.id);
    expect(acts.some((a) => a.type === "converted")).toBe(true);
  });
});
