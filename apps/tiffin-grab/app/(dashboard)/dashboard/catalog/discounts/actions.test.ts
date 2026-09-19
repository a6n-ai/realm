import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/catalog/load", () => ({ invalidateCatalogSnapshot: vi.fn() }));
const setAppSettings = vi.fn();
vi.mock("@/lib/services/app-settings.service", () => ({ setAppSettings, getAppSettings: async () => ({ timezone: "UTC", cutoffHour: 18 }) }));

const { saveDiscountCap } = await import("./actions");

describe("saveDiscountCap", () => {
  beforeEach(() => setAppSettings.mockClear());
  it.each([-1, 101, 12.5, Number.NaN])("rejects %s", async (v) => {
    await expect(saveDiscountCap({ maxDiscountPct: v })).rejects.toThrow();
    expect(setAppSettings).not.toHaveBeenCalled();
  });
  it.each([0, 25, 100])("saves %s", async (v) => {
    await saveDiscountCap({ maxDiscountPct: v });
    expect(setAppSettings).toHaveBeenCalledWith({ timezone: "UTC", cutoffHour: 18, maxDiscountPct: v });
  });
});
