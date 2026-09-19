import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn() }));
const setAppSettings = vi.fn();
vi.mock("@/lib/services/app-settings.service", () => ({ setAppSettings, getAppSettings: async () => ({ timezone: "UTC", cutoffHour: 18 }) }));

const { saveTiffinsPerWeek } = await import("./actions");

describe("saveTiffinsPerWeek", () => {
  it.each([[0, 3], [1, 8], [4, 3], [1.5, 3]])("rejects %s..%s", async (a, b) => {
    await expect(saveTiffinsPerWeek({ minTiffinsPerWeek: a, maxTiffinsPerWeek: b })).rejects.toThrow();
    expect(setAppSettings).not.toHaveBeenCalled();
  });
  it("saves valid range", async () => {
    await saveTiffinsPerWeek({ minTiffinsPerWeek: 2, maxTiffinsPerWeek: 7 });
    expect(setAppSettings).toHaveBeenCalledWith({ timezone: "UTC", cutoffHour: 18, minTiffinsPerWeek: 2, maxTiffinsPerWeek: 7 });
  });
});
