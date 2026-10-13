import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";

const { db } = await import("@/db/client");
const { deliveries, holidays, orders, organization } = await import("@/db/schema");
const { assertStartNotHoliday, holidayForOrderDate, upcomingHolidays } = await import("../holiday-dates");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-HOLDATES01";
const PFX = "tholdt";

// Own organization per file: holidays are unique per organization + date, and files run in parallel.
async function ownOrgId(): Promise<string> {
  const slug = `${PFX}-org`;
  const [row] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1);
  if (row) return row.id;
  const [made] = await db.insert(organization).values({ name: `${PFX} org`, slug, clientCode: PFX.toUpperCase() }).onConflictDoNothing().returning({ id: organization.id });
  if (made) return made.id;
  return (await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1))[0]!.id;
}
const reset = async () => {
  await resetTrips(DEP, PFX);
  await db.delete(holidays).where(like(holidays.name, `${PFX}%`));
};

describe("holiday-dates", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns holidays on or after `from` for one organization, keyed by date", async () => {
    const org = await ownOrgId();
    await db.insert(holidays).values([
      { organizationId: org, date: "2030-01-09", name: `${PFX} mid` },
      { organizationId: org, date: "2030-01-02", name: `${PFX} early` },
    ]);
    const map = await upcomingHolidays(db, org, "2030-01-05");
    expect([...map.keys()]).toEqual(["2030-01-09"]);
    expect(map.get("2030-01-09")!.name).toBe(`${PFX} mid`);
  });

  it("returns nothing for an order with no organization", async () => {
    expect((await upcomingHolidays(db, null, "2030-01-01")).size).toBe(0);
  });

  it("finds the holiday for an order's organization and date", async () => {
    const org = await ownOrgId();
    const { order } = await makeTripOrder(DEP, PFX);
    await db.insert(holidays).values({ organizationId: org, date: "2030-01-09", name: `${PFX} one` });
    expect(await holidayForOrderDate(db, order.id, "2030-01-09")).toBeNull();
    await db.update(orders).set({ organizationId: org }).where(eq(orders.id, order.id));
    expect((await holidayForOrderDate(db, order.id, "2030-01-09"))?.name).toBe(`${PFX} one`);
    expect(await holidayForOrderDate(db, order.id, "2030-01-10")).toBeNull();
  });

  it("refuses a start date that is a holiday and allows the day after", async () => {
    const org = await ownOrgId();
    await db.insert(holidays).values({ organizationId: org, date: "2030-02-04", name: `${PFX} closed` });
    await expect(assertStartNotHoliday(db, org, "2030-02-04")).rejects.toThrow(`We are closed on Mon, Feb 4 (${PFX} closed). Pick another start date`);
    await expect(assertStartNotHoliday(db, org, "2030-02-05")).resolves.toBeUndefined();
    await expect(assertStartNotHoliday(db, null, "2030-02-04")).resolves.toBeUndefined();
  });

  it("a closed row and the rows added for it carry their links", async () => {
    const org = await ownOrgId();
    const { order, wed } = await makeTripOrder(DEP, PFX);
    const [h] = await db.insert(holidays).values({ organizationId: org, date: "2030-01-09", name: `${PFX} link` }).returning();
    await db.update(deliveries).set({ status: "paused", holidayId: h!.id }).where(eq(deliveries.id, wed.id));
    const [extra] = await db.insert(deliveries).values({
      orderId: order.id, deliveryDate: "2030-01-14", status: "scheduled", cutoffAt: Date.now() + 1e9, tiffinUnits: 1, coversDates: ["2030-01-14"], holidayExtraForDeliveryId: wed.id,
    }).returning();
    expect([extra!.holidayExtraForDeliveryId, extra!.makeupForDeliveryId, extra!.holidayId]).toEqual([wed.id, null, null]);
  });
});
