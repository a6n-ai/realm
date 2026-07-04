import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { renderWeeklyMenuPdf } = await import("../pdf");
const { menuService } = await import("@/lib/services/menu.service");

describe("renderWeeklyMenuPdf", () => {
  it("returns a %PDF- byte stream for a published week", async () => {
    vi.spyOn(menuService, "getPublishedWeek").mockResolvedValue({
      planType: "tiffin", theme: { accent: "#F0820A", titlePrefix: "Tiffin Menu" },
      weekStart: "2099-01-05", slots: [{ key: "lunch", label: "Lunch" }],
      items: [{ dayOfWeek: "mon", slot: "lunch", dishName: "Paneer", diet: "veg", position: 0 }],
    } as never);
    const bytes = await renderWeeklyMenuPdf("tiffin");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("throws when nothing is published", async () => {
    vi.spyOn(menuService, "getPublishedWeek").mockResolvedValue(null);
    await expect(renderWeeklyMenuPdf("tiffin")).rejects.toThrow();
  });
});
