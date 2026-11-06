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

import { placeLabels } from "../static-map";

describe("placeLabels", () => {
  it("puts every name above its dot when nothing collides", () => {
    expect(placeLabels([{ name: "Brampton", x: 100, y: 100 }, { name: "Markham", x: 400, y: 100 }])).toEqual(["top", "top"]);
  });
  it("drops a crowded name below its dot", () => {
    // Two dots 20px apart: East York sits higher and keeps the top; Toronto drops below.
    expect(placeLabels([{ name: "Toronto", x: 200, y: 200 }, { name: "East York", x: 220, y: 196 }])).toEqual(["bottom", "top"]);
  });
  it("keeps a name above when the one below is far enough away", () => {
    expect(placeLabels([{ name: "Vaughan", x: 200, y: 100 }, { name: "Etobicoke", x: 200, y: 200 }])).toEqual(["top", "top"]);
  });
  it("hides a name with no room above or below; its chip still lights it", () => {
    // A tight stack: Vaughan's name hits Markham's dot above and North York's dot below; North York's
    // hits Vaughan's dot above and Etobicoke's below. Both middle names hide; the ends keep theirs.
    const tight = [{ name: "Markham", x: 200, y: 100 }, { name: "Vaughan", x: 200, y: 130 }, { name: "North York", x: 200, y: 160 }, { name: "Etobicoke", x: 200, y: 185 }];
    expect(placeLabels(tight)).toEqual(["top", "none", "none", "bottom"]);
  });
});
