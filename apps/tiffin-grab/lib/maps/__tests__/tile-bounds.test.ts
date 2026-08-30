import { describe, expect, it } from "vitest";
import { isValidTile } from "../tile-bounds";

/**
 * The original validator was `\d{1,3}`, which silently capped tile coordinates
 * at 999 — every tile above zoom 9 returned 400 and the map rendered blank. It
 * looked healthy because the one URL tested by hand, 11/572/375, happens to be
 * three digits per segment. These cases are chosen to fail that regex.
 */
describe("isValidTile", () => {
  it.each([
    ["11", "572", "375"],
    ["13", "2291", "2988"],
    ["14", "4583", "5976"],
    ["18", "73339", "95627"],
    ["22", "4194303", "4194303"],
    ["0", "0", "0"],
  ])("accepts real tile %s/%s/%s", (z, x, y) => {
    expect(isValidTile(z, x, y)).toBe(true);
  });

  it.each([
    ["23", "1", "1"], // past max zoom
    ["2", "4", "0"], // x == 2^z, one past the edge
    ["2", "0", "4"], // y == 2^z
    ["-1", "0", "0"],
    ["10", "1e3", "5"], // numeric-looking but not digits
    ["10", "5", "../../etc"],
    ["10", "", "5"],
  ])("rejects %s/%s/%s", (z, x, y) => {
    expect(isValidTile(z, x, y)).toBe(false);
  });
});
