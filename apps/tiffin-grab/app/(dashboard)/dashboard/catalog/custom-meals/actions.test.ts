import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireAdmin }));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => 7n }));
const upsertPricing = vi.fn();
vi.mock("@/lib/services/custom-meal.service", () => ({ upsertPricing }));

const { saveCustomMealPricing } = await import("./actions");

const valid = { categoryKey: "sabzi", planKey: "veg", pricePerTu: 3.5, maxTu: null, active: true };

describe("saveCustomMealPricing", () => {
  beforeEach(() => {
    upsertPricing.mockClear();
    requireAdmin.mockReset();
  });

  it("upserts a valid row with the session actor", async () => {
    await saveCustomMealPricing(valid);
    expect(upsertPricing).toHaveBeenCalledWith(valid, 7n);
  });

  it("rejects a negative price", async () => {
    expect(await saveCustomMealPricing({ ...valid, pricePerTu: -1 })).toHaveProperty("error");
    expect(upsertPricing).not.toHaveBeenCalled();
  });

  it("rounds price to cents", async () => {
    await saveCustomMealPricing({ ...valid, pricePerTu: 3.456 });
    expect(upsertPricing).toHaveBeenCalledWith({ ...valid, pricePerTu: 3.46 }, 7n);
  });

  it("rejects a non-admin without writing", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    expect(await saveCustomMealPricing(valid)).toHaveProperty("error");
    expect(upsertPricing).not.toHaveBeenCalled();
  });
});
