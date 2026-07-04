import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones, inquiries, inquiryActivities } from "@/db/schema";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");

const TEST_ZONE = "Prefs Test Zone";

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  session.user = null;
}

async function ensureZone(): Promise<bigint> {
  const [existing] = await db
    .select({ id: deliveryZones.id })
    .from(deliveryZones)
    .where(eq(deliveryZones.name, TEST_ZONE))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(deliveryZones)
    .values({
      name: TEST_ZONE,
      postalPrefixes: ["M4C"],
      slotWindow: "10:00 AM – 1:00 PM",
      active: true,
    })
    .returning({ id: deliveryZones.id });
  return created.id;
}

describe("inquiriesService zone resolution + intake prefs", () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await db.delete(deliveryZones).where(eq(deliveryZones.name, TEST_ZONE));
  });

  it("resolves zoneId from a matching postal code", async () => {
    const zoneId = await ensureZone();
    const inq = await inquiriesService.create({
      fullName: "Lead Z",
      phone: "+16475553000",
      sourceKey: "manual",
      postalCode: "M4C 1A1",
    });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.zoneId).toBe(zoneId);
  });

  it("sets zoneId null for an unmatched postal code", async () => {
    await ensureZone();
    const inq = await inquiriesService.create({
      fullName: "Lead Q",
      phone: "+16475553001",
      sourceKey: "manual",
      postalCode: "Z9Z 9Z9",
    });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.zoneId).toBeNull();
  });

  it("sets zoneId null when no postal code is provided", async () => {
    const inq = await inquiriesService.create({
      fullName: "Lead N",
      phone: "+16475553002",
      sourceKey: "manual",
    });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.zoneId).toBeNull();
  });

  it("passes intake prefs through to the row", async () => {
    const inq = await inquiriesService.create({
      fullName: "Lead P",
      phone: "+16475553003",
      sourceKey: "manual",
      planInterest: "veg",
      mealSizeInterest: "small_thali",
      personsInterest: 2,
      preferredStart: "2026-07-01",
      quotedPrice: 49.99,
      notes: "wants veg only",
    });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.planInterest).toBe("veg");
    expect(row.mealSizeInterest).toBe("small_thali");
    expect(row.personsInterest).toBe(2);
    expect(row.preferredStart).toBe("2026-07-01");
    expect(Number(row.quotedPrice)).toBe(49.99);
    expect(row.notes).toBe("wants veg only");
  });
});
