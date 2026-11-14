import { describe, expect, it } from "vitest";
import { heatOf } from "../reinquiry-heat";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 14);

describe("re-inquiry heat", () => {
  it("is hot after two or more re-inquiries in the last 7 days", () => {
    expect(heatOf({ recent7: 2, lastAt: now - DAY, sourceKey: "manual" }, now)).toBe("hot");
  });

  it("is hot for a paid source (Meta, website) within 30 days", () => {
    expect(heatOf({ recent7: 0, lastAt: now - 20 * DAY, sourceKey: "facebook" }, now)).toBe("hot");
    expect(heatOf({ recent7: 1, lastAt: now - DAY, sourceKey: "website" }, now)).toBe("hot");
  });

  it("is warm for one unpaid re-inquiry within 30 days", () => {
    expect(heatOf({ recent7: 1, lastAt: now - DAY, sourceKey: "manual" }, now)).toBe("warm");
    expect(heatOf({ recent7: 0, lastAt: now - 30 * DAY, sourceKey: null }, now)).toBe("warm");
  });

  it("is cold once the last re-inquiry is over 30 days old, paid or not", () => {
    expect(heatOf({ recent7: 0, lastAt: now - 31 * DAY, sourceKey: "manual" }, now)).toBe("cold");
    expect(heatOf({ recent7: 0, lastAt: now - 45 * DAY, sourceKey: "instagram" }, now)).toBe("cold");
  });
});
