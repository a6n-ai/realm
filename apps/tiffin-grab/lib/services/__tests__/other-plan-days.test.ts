import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const { db } = await import("@/db/client");
const { orders } = await import("@/db/schema");
const { otherPlanDays } = await import("../order-window");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-OTHERPLAN01";
const DEP2 = "SUB-OTHERPLAN02";
const PFX = "totherpl";
const reset = async () => { await resetTrips(DEP2, `${PFX}b`); await resetTrips(DEP, PFX); };

/** Two plans of one customer: `mine` (the one asking) and `other`, in the given status, same Mon/Wed/Fri trips. */
async function twoPlans(otherStatus: "active" | "pending") {
  const { order: mine } = await makeTripOrder(DEP, PFX);
  const { order: other } = await makeTripOrder(DEP2, `${PFX}b`);
  await db.update(orders).set({ userId: mine.userId, status: otherStatus }).where(eq(orders.id, other.id));
  return { mine, other };
}

describe("otherPlanDays: band and rows disagree", () => {
  beforeEach(reset);
  afterAll(reset);

  it("a pending plan holds its trip days by rows but reserves no band", async () => {
    const { mine, other } = await twoPlans("pending");
    const args = { userId: mine.userId!, excludeOrderId: mine.id };
    expect((await otherPlanDays(db, { ...args, rule: "band" })).onTrip("2030-01-07")).toBeNull();
    expect((await otherPlanDays(db, { ...args, rule: "rows" })).onTrip("2030-01-07")).toBe(other.startDate);
  });

  it("an active plan's band covers a day between its trips; rows hold only trip days and the days they carry", async () => {
    const { mine, other } = await twoPlans("active");
    const args = { userId: mine.userId!, excludeOrderId: mine.id };
    const band = await otherPlanDays(db, { ...args, rule: "band" });
    const rows = await otherPlanDays(db, { ...args, rule: "rows" });
    expect(band.onTrip("2030-01-08")).toBe(other.startDate);
    expect(rows.onTrip("2030-01-08")).toBeNull();
    expect(rows.onEat("2030-01-08")).toBe(true);
    expect(rows.onTrip("2030-01-09")).toBe(other.startDate);
  });
});
