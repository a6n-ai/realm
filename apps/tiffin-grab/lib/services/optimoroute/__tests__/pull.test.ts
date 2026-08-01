import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import type { OptimoRoute } from "../client";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

let plannedRoutes: OptimoRoute[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return { ...actual, getRoutes: async () => plannedRoutes };
});

const { pullRoutes, driverCodeFor } = await import("../pull");
const { sortForPrinting, routeTotals } = await import("@/lib/services/daily-labels.service");

const DATE = (() => {
  const d = new Date(Date.now() + 70 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

const DEPLOYMENT = "SUB-PULL01";
const USER_PREFIX = "pull";

let deliveryIds: bigint[] = [];
let publicIds: string[] = [];

async function reset() {
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.deploymentId, DEPLOYMENT));
  const ids = mine.map((o) => o.id);
  if (ids.length) {
    await db.delete(orderActivities).where(inArray(orderActivities.orderId, ids));
    await db.delete(deliveries).where(inArray(deliveries.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  await db.delete(users).where(like(users.email, `${USER_PREFIX}%@test.invalid`));
}

describe("pullRoutes (integration)", () => {
  beforeEach(async () => {
    plannedRoutes = [];
    await reset();
    const snap = await loadCatalogSnapshot();

    const [u] = await db
      .insert(users)
      .values({
        email: `${USER_PREFIX}${Math.random().toString(36).slice(2)}@test.invalid`,
        role: "user",
      })
      .returning();

    const [o] = await db
      .insert(orders)
      .values({
        userId: u.id,
        planId: snap.plans.find((p) => p.key === "veg")!.id,
        mealSizeId: snap.mealSizes[0].id,
        frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
        persons: 1,
        mealSlots: ["lunch"],
        categoryCounts: { sabzi: 1 },
        durationWeeks: 1,
        startDate: DATE,
        tiffinCount: 5,
        perTiffinPrice: "10.00",
        pricingSnapshot: {},
        total: "50.00",
        status: "active",
        deploymentId: DEPLOYMENT,
        fullName: "Pull Tester",
        addressLine: "9 Bay St",
        city: "Toronto",
        postalCode: "M5J 2T3",
      })
      .returning();

    // Two deliveries on the same date via a second order would trip the unique index, so
    // use one order with two dates and pull the one we care about.
    const rows = await db
      .insert(deliveries)
      .values([
        { orderId: o.id, deliveryDate: DATE, status: "scheduled", cutoffAt: Date.now() + 1e9 },
      ])
      .returning();
    deliveryIds = rows.map((r) => r.id);
    publicIds = rows.map((r) => r.publicId);
  });
  afterAll(reset);

  it("stores driver and stop number on the delivery", async () => {
    plannedRoutes = [
      {
        driverSerial: "drv-4",
        driverName: "Driver 4",
        stops: [{ orderNo: publicIds[0], stopNumber: 3 }],
      },
    ];

    const result = await pullRoutes(DATE);
    expect(result.matched).toBe(1);

    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryIds[0]));
    expect(row.routeDriverSerial).toBe("drv-4");
    expect(row.routeDriverName).toBe("Driver 4");
    expect(row.routeStopNumber).toBe(3);
    expect(row.routeSyncedAt).toBeTypeOf("number");
  });

  it("reports stops it did not create rather than inventing deliveries", async () => {
    plannedRoutes = [
      { driverName: "Driver 1", stops: [{ orderNo: "43 Yatharth Aggarwal", stopNumber: 1 }] },
    ];
    const result = await pullRoutes(DATE);
    expect(result.matched).toBe(0);
    expect(result.unknownOrderNos).toEqual(["43 Yatharth Aggarwal"]);
  });

  it("clears an assignment when the delivery drops off the plan", async () => {
    plannedRoutes = [{ driverName: "Driver 4", stops: [{ orderNo: publicIds[0], stopNumber: 1 }] }];
    await pullRoutes(DATE);

    // Re-planned without this stop.
    plannedRoutes = [{ driverName: "Driver 4", stops: [] }];
    const result = await pullRoutes(DATE);
    expect(result.cleared).toBe(1);

    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryIds[0]));
    // Stale route data would keep printing this label into a van that is not going there.
    expect(row.routeDriverName).toBeNull();
    expect(row.routeStopNumber).toBeNull();
    expect(row.routeSyncedAt).toBeNull();
  });

  it("ignores placeholder stops", async () => {
    plannedRoutes = [{ driverName: "Driver 1", stops: [{ orderNo: "-" }, { orderNo: "  " }] }];
    const result = await pullRoutes(DATE);
    expect(result.matched).toBe(0);
    expect(result.unknownOrderNos).toEqual([]);
  });
});

describe("driverCodeFor", () => {
  it("prefers the configured code for a stable serial", () => {
    expect(driverCodeFor({ "drv-4": "D4" }, "drv-4", "Raj")).toBe("D4");
  });

  it("falls back to the name, never to digits scraped out of it", () => {
    // The spreadsheet regexes "Driver 4" → D4; rename to "Raj" and that silently changes.
    expect(driverCodeFor({}, "drv-4", "Raj")).toBe("Raj");
    expect(driverCodeFor({}, null, null)).toBeNull();
  });
});

describe("label ordering", () => {
  const label = (over: Partial<Parameters<typeof sortForPrinting>[0][number]>) =>
    ({
      deliveryPublicId: "d", orderPublicId: "o", deploymentId: "SUB", customerName: "Z",
      phone: null, addressLine: "", city: "", postalCode: "", zoneName: null,
      routeDriver: null, routeStop: null, planName: "", mealSizeName: "",
      personIndex: 1, persons: 1, deliveryNotes: null, lines: [], ...over,
    }) as Parameters<typeof sortForPrinting>[0][number];

  it("orders by driver then stop — the sequence the van is loaded in", () => {
    const sorted = sortForPrinting([
      label({ customerName: "C", routeDriver: "Driver 2", routeStop: 1 }),
      label({ customerName: "A", routeDriver: "Driver 1", routeStop: 2 }),
      label({ customerName: "B", routeDriver: "Driver 1", routeStop: 1 }),
    ]);
    expect(sorted.map((l) => l.customerName)).toEqual(["B", "A", "C"]);
  });

  it("sorts driver numbers naturally, so Driver 10 follows Driver 9", () => {
    const sorted = sortForPrinting([
      label({ customerName: "ten", routeDriver: "Driver 10", routeStop: 1 }),
      label({ customerName: "nine", routeDriver: "Driver 9", routeStop: 1 }),
    ]);
    expect(sorted.map((l) => l.customerName)).toEqual(["nine", "ten"]);
  });

  it("falls back to zone before routes are pulled", () => {
    const sorted = sortForPrinting([
      label({ customerName: "B", zoneName: "West" }),
      label({ customerName: "A", zoneName: "East" }),
    ]);
    expect(sorted.map((l) => l.customerName)).toEqual(["A", "B"]);
  });

  it("marks a group as planned only when it came from a pull", () => {
    const totals = routeTotals([
      label({ routeDriver: "Driver 1" }),
      label({ zoneName: "West" }),
    ]);
    expect(totals.find((t) => t.group === "Driver 1")?.planned).toBe(true);
    expect(totals.find((t) => t.group === "West")?.planned).toBe(false);
  });
});
