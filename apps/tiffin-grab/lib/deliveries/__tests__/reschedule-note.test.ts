import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return { ...actual, deleteOrder: vi.fn(async () => undefined) };
});
vi.mock("@/lib/services/optimoroute/push", () => ({ pushOneDelivery: vi.fn(async () => undefined) }));

const { db } = await import("@/db/client");
const { deliveries, deliveryMoves, orderActivities } = await import("@/db/schema");
const { rescheduleDelivery } = await import("../deliveries.service");
const { makeTripOrder, resetTrips } = await import("../../services/__tests__/trip-fixture");

const DEP = "SUB-RESNOTE01";
const PFX = "tresnote";

describe("rescheduleDelivery move note", () => {
  beforeEach(() => resetTrips(DEP, PFX));
  afterAll(() => resetTrips(DEP, PFX));

  it("is written in the move's own transaction: a failing note undoes the move", async () => {
    const { order, wed } = await makeTripOrder(DEP, PFX);
    await expect(rescheduleDelivery(wed.publicId, "2030-01-21", 1n, "2030-01-09", 1, () => { throw new Error("note failed"); })).rejects.toThrow("note failed");
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, wed.id));
    expect(row!.status).toBe("scheduled");
    expect(await db.select().from(deliveryMoves).where(eq(deliveryMoves.orderId, order.id))).toHaveLength(0);
  });

  it("lands next to the move when it succeeds", async () => {
    const { order, wed } = await makeTripOrder(DEP, PFX);
    await rescheduleDelivery(wed.publicId, "2030-01-21", 1n, "2030-01-09", 1, (carriedOn) => `moved to ${carriedOn}`);
    const notes = await db.select().from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(notes.some((n) => n.note?.startsWith("moved to "))).toBe(true);
  });
});
