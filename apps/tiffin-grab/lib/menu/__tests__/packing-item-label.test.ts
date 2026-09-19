import { describe, expect, it } from "vitest";
import { packingItemLabel } from "../packing-item-label";

describe("packingItemLabel", () => {
  it("puts each sabzi/daal oz beside the dish so a 12oz and 8oz share one cell", () => {
    expect(
      packingItemLabel(
        [{ name: "Chilli Chicken" }, { name: "Saag Paneer" }],
        ["12oz", "8oz"],
        2,
        "weight",
      ),
    ).toBe("Chilli Chicken 12oz, Saag Paneer 8oz");
  });

  it("puts the rice/roti piece count on the name, not '1 unit' per line", () => {
    expect(packingItemLabel([{ name: "Jeera Rice" }], ["1 unit"], 1, "count")).toBe("Jeera Rice 1");
    expect(
      packingItemLabel(
        Array.from({ length: 8 }, () => ({ name: "Roti" })),
        Array.from({ length: 8 }, () => "1 roti"),
        8,
        "count",
      ),
    ).toBe("Roti 8");
    expect(packingItemLabel([{ name: "Jeera Rice" }], ["1 unit"], 2, "count")).toBe("Jeera Rice 2");
    expect(packingItemLabel([{ name: "Roti" }], ["1 roti"], 4, "count")).toBe("Roti 4");
  });

  it("keeps the bare dish name when a weight slot has no catalog portion", () => {
    expect(packingItemLabel([{ name: "Dal Tadka" }], [null], 1, "weight")).toBe("Dal Tadka");
  });
});
