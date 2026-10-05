import { describe, expect, it, vi } from "vitest";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { resolveCompositionRows } = await import("../catalog.service");

// Saving a meal size full-replaces its items, so a role the editor drops would silently
// turn every side back into a main.
describe("meal-size item role survives a save", () => {
  it("keeps the role on each saved row and defaults a missing one to main", async () => {
    const { rows } = await resolveCompositionRows([
      { category: "sabzi", planId: "veg", tuAmount: "1.50", role: "main" },
      { category: "sabzi", planId: "veg", tuAmount: "1.00", role: "side_1" },
      { category: "daal", planId: "veg", tuAmount: "1.50" },
    ]);
    expect(rows.map((r) => r.role)).toEqual(["main", "side_1", "main"]);
  });

  it("parses the role from the editor form, main by default", () => {
    const schema = RESOURCES["meal-sizes"].schema;
    const base = { key: "k", name: "N", tier: "budget", planId: "veg", kcalMin: 0, kcalMax: 0, basePrice: 0, active: true };
    const parsed = schema.parse({ ...base, items: [{ category: "sabzi", planId: "veg", tuAmount: 1, role: "side_1" }, { category: "daal", planId: "veg", tuAmount: 1 }] }) as { items: { role: string }[] };
    expect(parsed.items.map((i) => i.role)).toEqual(["side_1", "main"]);
  });
});
