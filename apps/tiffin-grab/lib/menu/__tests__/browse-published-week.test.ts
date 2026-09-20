import { afterEach, describe, expect, it, vi } from "vitest";
import { comingWeekStartIso, thisWeekStartIso } from "../delivery-dates";

vi.mock("@/lib/services/menu.service", () => ({
  menuService: { getPublishedWeek: vi.fn() },
}));

const { menuService } = await import("@/lib/services/menu.service");
const { browsePublishedWeek } = await import("../browse-published-week");

const TZ = "America/Toronto";
const NOW = Date.parse("2026-09-20T16:00:00Z"); // Sunday — this week is 14–20, coming is 21–27
const poster = (weekStart: string) => ({ weekStart, items: [], slots: [], theme: { accent: "#f60", titlePrefix: "Tiffin" } });

afterEach(() => {
  vi.mocked(menuService.getPublishedWeek).mockReset();
});

describe("browsePublishedWeek", () => {
  it("shows this week when it is released", async () => {
    const thisMonday = thisWeekStartIso(NOW, TZ);
    vi.mocked(menuService.getPublishedWeek).mockImplementation(async (weekStart?: string) =>
      weekStart === thisMonday ? poster(thisMonday) : null,
    );
    const result = await browsePublishedWeek(NOW, TZ);
    expect(result.scope).toBe("this");
    expect(result.week?.weekStart).toBe(thisMonday);
  });

  it("shows the coming released week when this week is unpublished", async () => {
    const comingMonday = comingWeekStartIso(NOW, TZ);
    expect(comingMonday).toBe("2026-09-21");
    vi.mocked(menuService.getPublishedWeek).mockImplementation(async (weekStart?: string) =>
      weekStart === comingMonday ? poster(comingMonday) : null,
    );
    const result = await browsePublishedWeek(NOW, TZ);
    expect(result.scope).toBe("next");
    expect(result.week?.weekStart).toBe("2026-09-21");
  });

  it("does not fall back to a past week", async () => {
    vi.mocked(menuService.getPublishedWeek).mockResolvedValue(null);
    await expect(browsePublishedWeek(NOW, TZ)).resolves.toEqual({ week: null, scope: null });
  });
});
