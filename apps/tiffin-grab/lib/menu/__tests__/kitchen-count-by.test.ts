import { describe, expect, it, vi } from "vitest";
import type { DeliveryLabel, LabelLine } from "../daily-labels.service";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { countBy } = await import("../daily-labels.service");

const label = (lines: LabelLine[]) => ({ lines }) as unknown as DeliveryLabel;
const line = (category: string, dish: string, portion: string, dishCategory?: { key: string; label: string }): LabelLine => ({
  category, categoryLabel: category, dish, portion, defaulted: true, dishCategory,
});

describe("countBy", () => {
  it("counts a dish under its own category, not the slot it was picked in", () => {
    const daal = { key: "daal", label: "Daal" };
    const counts = countBy([
      label([line("daal", "Kali Dal", "8oz")]),
      // Side 2 of the Sabzi slot defaulted to Kali Dal: same pot as the Daal slot's.
      label([line("sabzi", "Kali Dal", "8oz", daal), line("sabzi", "Aloo Matar", "8oz")]),
    ]);
    expect(counts).toEqual([
      expect.objectContaining({ category: "daal", dish: "Kali Dal", portion: "8oz", count: 2 }),
      expect.objectContaining({ category: "sabzi", dish: "Aloo Matar", count: 1 }),
    ]);
  });
});
