import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const { db } = await import("@/db/client");
const { orders } = await import("@/db/schema");
const { otherPlanDays } = await import("../../orders/order-window");
const { makeTripOrder, resetTrips } = await import("../../services/__tests__/trip-fixture");

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

describe("otherPlanDays", () => {
  beforeEach(reset);
  afterAll(reset);

  it("a pending plan holds its trip days", async () => {
    const { mine, other } = await twoPlans("pending");
    const days = await otherPlanDays(db, { userId: mine.userId!, excludeOrderId: mine.id });
    expect(days.onTrip("2030-01-07")).toBe(other.startDate);
  });

  it("an active plan holds trip days and the days they carry, not a day between trips", async () => {
    const { mine, other } = await twoPlans("active");
    const days = await otherPlanDays(db, { userId: mine.userId!, excludeOrderId: mine.id });
    expect(days.onTrip("2030-01-08")).toBeNull();
    expect(days.onEat("2030-01-08")).toBe(true);
    expect(days.onTrip("2030-01-09")).toBe(other.startDate);
  });
});
