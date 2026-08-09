import { describe, expect, it } from "vitest";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG, destinationPoint, haversineKm } from "../distance";

const STORE = { lat: DEFAULT_STORE_LAT, lng: DEFAULT_STORE_LNG };

describe("destinationPoint", () => {
  // The property that matters: it must be the exact inverse of haversineKm.
  // The zone rings are drawn with this and measured with that, so any drift
  // between them puts the drawn boundary somewhere the server disagrees with.
  it.each([1, 3, 7, 25])("round-trips to %ikm on every bearing", (km) => {
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const p = destinationPoint(STORE.lat, STORE.lng, km, bearing);
      expect(haversineKm(STORE.lat, STORE.lng, p.lat, p.lng)).toBeCloseTo(km, 6);
    }
  });

  it("heads the right way for the cardinal bearings", () => {
    const north = destinationPoint(STORE.lat, STORE.lng, 5, 0);
    const east = destinationPoint(STORE.lat, STORE.lng, 5, 90);
    expect(north.lat).toBeGreaterThan(STORE.lat);
    expect(north.lng).toBeCloseTo(STORE.lng, 6);
    expect(east.lng).toBeGreaterThan(STORE.lng);
    expect(east.lat).toBeCloseTo(STORE.lat, 3);
  });

  it("keeps longitude in [-180, 180] when a ring crosses the antimeridian", () => {
    // 100km east of longitude 179.9 wraps past the date line.
    const p = destinationPoint(0, 179.9, 100, 90);
    expect(p.lng).toBeGreaterThanOrEqual(-180);
    expect(p.lng).toBeLessThanOrEqual(180);
    expect(p.lng).toBeLessThan(0); // wrapped to the western side
  });

  it("returns the start point for a zero-distance ring", () => {
    const p = destinationPoint(STORE.lat, STORE.lng, 0, 123);
    expect(p.lat).toBeCloseTo(STORE.lat, 9);
    expect(p.lng).toBeCloseTo(STORE.lng, 9);
  });
});
