import { describe, expect, it } from "vitest";
import { fit } from "../static-map";

const toronto = { lat: 43.65, lng: -79.38 };
const brampton = { lat: 43.73, lng: -79.76 };
const markham = { lat: 43.86, lng: -79.34 };

describe("fit", () => {
  it("puts every area inside the padded box on a phone", () => {
    const cam = fit([toronto, brampton, markham], 358, 300, false);
    for (const p of [toronto, brampton, markham]) {
      const q = cam.at(p);
      expect(q.x).toBeGreaterThanOrEqual(36);
      expect(q.x).toBeLessThanOrEqual(358 - 36);
      expect(q.y).toBeGreaterThanOrEqual(36);
      expect(q.y).toBeLessThanOrEqual(300 - 36);
    }
  });
  it("keeps the desktop panel's left side clear", () => {
    const cam = fit([toronto, brampton, markham], 1200, 560, true);
    for (const p of [toronto, brampton, markham]) expect(cam.at(p).x).toBeGreaterThanOrEqual(440);
  });
  it("uses a whole zoom, capped for a single point", () => {
    const cam = fit([toronto], 358, 300, false);
    expect(cam.z).toBe(12);
    expect(Number.isInteger(fit([toronto, markham], 800, 500, false).z)).toBe(true);
  });
});
