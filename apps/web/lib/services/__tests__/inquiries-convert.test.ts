import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@tiffin/commons";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, ledgerEntries, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
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
    session.user = { id: staff.publicId, role: "member" };
    const inq = await inquiriesService.create({ fullName: "Lead D", phone: "+16475551200", sourceKey: "manual" });
    const [inqRow] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    const { deploymentId } = await inquiriesService.convert(inq.publicId, {
      planKey: plan.key,
      selections: {
        mealSizeId: meal.publicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
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
    expect(inqRow.currentOwner).not.toBeNull();
    expect(order.currentOwner).toBe(inqRow.currentOwner);
    const acts = await inquiriesService.listActivities(inq.publicId);
    expect(acts.some((a) => a.type === "converted")).toBe(true);
  });
});
