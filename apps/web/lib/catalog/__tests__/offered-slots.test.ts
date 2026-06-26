import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("../load");
const { setMealTypes, getMealTypes } = await import("@/lib/services/app-settings.service");

describe("catalog offeredSlots derives from meal types", () => {
  it("healthy plans expose the configured healthy slots", async () => {
    const current = await getMealTypes();
    await setMealTypes({ ...current, healthy: { ...current.healthy, slots: [{ key: "lunch", label: "Lunch" }, { key: "dinner", label: "Dinner" }] } });
    // Evict catalog cache so stale snapshot doesn't mask the change.
    await invalidateCatalogSnapshot();
    const snap = await loadCatalogSnapshot();
    const healthy = snap.plans.find((p) => p.planType === "healthy");
    expect(healthy).toBeDefined();
    expect(healthy!.offeredSlots).toEqual(["lunch", "dinner"]);
  });
});
