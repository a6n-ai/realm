import { describe, expect, it } from "vitest";
import { keySeries, seriesKey } from "../series-keys";

describe("keySeries", () => {
  it("keys hostile and dotted series names by position", () => {
    const series = [
      { key: "x</style><b>", label: "x</style><b>" },
      { key: "Veg. Plan", label: "Veg. Plan" },
    ];
    const { rows, keys } = keySeries([{ tier: "Small", "x</style><b>": 3, "Veg. Plan": 5 }], series);
    expect(keys).toEqual(["s0", "s1"]);
    expect(rows[0]).toMatchObject({ s0: 3, s1: 5 });
    for (const k of keys) expect(k).toMatch(/^s\d+$/);
    expect(seriesKey(2)).toBe("s2");
  });
});
