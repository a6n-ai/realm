import { describe, expect, it } from "vitest";
import { clampRadiusKm, type MapZone } from "@/app/(dashboard)/dashboard/settings/delivery/zones/zone-map";

const zone = (publicId: string, radiusKm: number): MapZone => ({
  publicId,
  name: publicId,
  radiusKm,
  active: true,
  color: "#000",
});

const ZONES = [zone("zon_inner", 7), zone("zon_outer", 20)];

describe("clampRadiusKm", () => {
  it("leaves the outermost ring free above its inner neighbour", () => {
    expect(clampRadiusKm(20, ZONES, "zon_outer")).toBe(20);
    expect(clampRadiusKm(50, ZONES, "zon_outer")).toBe(50);
  });

  it("stops a ring just short of the neighbour it would cross", () => {
    expect(clampRadiusKm(7, ZONES, "zon_inner")).toBe(7);
    // Approaching the outer ring from below is blocked one gap short of it.
    expect(clampRadiusKm(19.995, ZONES, "zon_inner")).toBeCloseTo(19.99, 2);
  });

  /**
   * Bounds are derived from the CANDIDATE radius, not from the zone's identity,
   * so a ring pushed past its neighbour becomes the outer ring rather than being
   * blocked at it. Surprising if you read the names as positions — "Inner" at
   * 25km sits outside "Outer" at 20km — but the model is that a zone is a radius
   * and the name is only a label. Pinned because it looks like a bug otherwise.
   */
  it("lets a ring overtake its neighbour, reordering rather than blocking", () => {
    expect(clampRadiusKm(25, ZONES, "zon_inner")).toBe(25);
  });

  /**
   * The edit dialog used to clamp on every keystroke. Clearing the field to
   * retype gives Number("") === 0, which lands here and clamps to the 0.01
   * floor — the outermost ring then looked like the innermost (bounds recomputed
   * against 0.01, ceiling 6.99) and no new number could be typed. The clamp is
   * correct in isolation; the fix was to call it on blur, not per keystroke.
   * This pins the behaviour that made the misuse so damaging.
   */
  it("clamps a zeroed outer ring down to the floor — why it must not run mid-typing", () => {
    expect(clampRadiusKm(0, ZONES, "zon_outer")).toBeCloseTo(0.01, 2);
  });

  it("floors at the ring gap rather than allowing zero or negative", () => {
    expect(clampRadiusKm(0, [], "__new__")).toBeCloseTo(0.01, 2);
    expect(clampRadiusKm(-5, [], "__new__")).toBeCloseTo(0.01, 2);
  });

  it("treats a single ring as unbounded above", () => {
    expect(clampRadiusKm(99, [zone("zon_only", 5)], "zon_only")).toBe(99);
  });
});
