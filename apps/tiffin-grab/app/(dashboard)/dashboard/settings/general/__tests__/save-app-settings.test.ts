import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => undefined }));
vi.mock("@/lib/services/app-settings.service", () => ({ setAppSettings: (...a: unknown[]) => set(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveAppSettings } = await import("../actions");
const input = { timezone: "America/Toronto", cutoffHour: 20, currency: "CAD", defaultCountry: null, defaultMaxPauses: null, defaultMaxPauseDaysTotal: null, defaultMaxPauseStretchDays: null };

describe("saveAppSettings", () => {
  beforeEach(() => set.mockReset());

  it("saves a CAD store (TiffinGrab's currency) — it used to throw 'Unsupported currency'", async () => {
    expect(await saveAppSettings(input)).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ cutoffHour: 20, currency: "CAD" }));
  });

  it("returns validation problems as a message instead of throwing (prod hides thrown messages as React #441)", async () => {
    expect(await saveAppSettings({ ...input, cutoffHour: 24 })).toEqual({ error: "Cutoff hour must be an integer 0–23" });
    expect(set).not.toHaveBeenCalled();
  });
});
