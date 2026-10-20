import { describe, expect, it } from "vitest";
import { normalizePriceTable, setDefaultPrices } from "../app-settings.service";

describe("default price table validation", () => {
  it("rejects negative prices", async () => {
    await expect(setDefaultPrices({ "len:90": { weekday: -1, weekend: 78 } })).rejects.toThrow(/non-negative/);
  });
  it("rejects non len: keys", async () => {
    await expect(setDefaultPrices({ x: { weekday: 1, weekend: 2 } })).rejects.toThrow(/Invalid price row/);
  });
  it("rejects a missing day type", () => {
    expect(() => normalizePriceTable({ "len:90": { weekday: 68 } })).toThrow(/non-negative/);
  });
  it("rejects a fully blank row", () => {
    expect(() => normalizePriceTable({ "len:90": {} })).toThrow(/non-negative/);
  });
  it("round-trips a valid table", () => {
    const t = { "len:90": { weekday: 68, weekend: 78 }, "len:120": { weekday: 0, weekend: 98.5 } };
    expect(normalizePriceTable(t)).toEqual(t);
  });
});
