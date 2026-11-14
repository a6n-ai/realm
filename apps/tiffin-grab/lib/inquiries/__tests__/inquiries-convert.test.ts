import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { db } from "@/db/client";
import { deleteNonSystemUsers } from "@/db/test-helpers";
import { inquiries, inquiryActivities, leadCounters, ledgerEntries, orders, payments, users } from "@/db/schema";
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
  await deleteNonSystemUsers();
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
      .values({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  name: "Agent Staff", role: "member" })
      .returning({ publicId: users.publicId });
    session.user = { id: staff.publicId, role: "member" };
    const inq = await inquiriesService.create({
      fullName: "Lead D",
      phone: "+16475551200",
      sourceKey: "manual",
      email: `inq-${Math.random().toString(36).slice(2)}@test.invalid`,
    });
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
      contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName: "Lead D", phone: "+16475551200", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
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

describe("inquiriesService.convert quick adds", () => {
  beforeEach(async () => {
    await reset();
    await db.delete(leadCounters);
    const [staff] = await db
      .insert(users)
      .values({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`, name: "Agent Staff", role: "member" })
      .returning({ publicId: users.publicId });
    session.user = { id: staff.publicId, role: "member" };
  });
  afterAll(reset);

  async function orderInput(fullName: string, phone: string) {
    const snap = await loadCatalogSnapshot();
    return {
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    } as Parameters<typeof inquiriesService.convert>[1];
  }

  it("rejects a quick add still carrying its generated name", async () => {
    const q = await inquiriesService.create({ phone: "+16475556001", sourceKey: "manual" });
    await expect(inquiriesService.convert(q.publicId, await orderInput(q.fullName!, "+16475556001")))
      .rejects.toThrow("Add the customer's real name before converting");
  });

  it("rejects generated-looking names in other case, spacing or number", async () => {
    const q = await inquiriesService.create({ phone: "+16475556010", sourceKey: "manual" });
    for (const name of [q.fullName!.toLowerCase(), q.fullName!.replace(" ", "  "), "Lead 99999"]) {
      await expect(inquiriesService.convert(q.publicId, await orderInput(name, "+16475556010")))
        .rejects.toThrow("Add the customer's real name before converting");
    }
  });

  it("rejects a quick add with a blank name", async () => {
    const q = await inquiriesService.create({ phone: "+16475556002", sourceKey: "manual" });
    await expect(inquiriesService.convert(q.publicId, await orderInput("  ", "+16475556002"))).rejects.toThrow("Name is required");
  });

  it("converts a quick add with a real name and writes it to the inquiry", async () => {
    const q = await inquiriesService.create({ phone: "+16475556003", sourceKey: "manual" });
    await inquiriesService.convert(q.publicId, await orderInput("Priya S.", "+16475556003"));
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, q.id));
    expect(row.stage).toBe("converted");
    expect(row.fullName).toBe("Priya S.");
  });

  it("keeps a named lead's stored name", async () => {
    const n = await inquiriesService.create({ fullName: "Stored Name", phone: "+16475556004", sourceKey: "manual" });
    await inquiriesService.convert(n.publicId, await orderInput("Other Name", "+16475556004"));
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, n.id));
    expect(row.fullName).toBe("Stored Name");
  });
});
