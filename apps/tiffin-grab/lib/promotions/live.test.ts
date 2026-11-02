import { describe, expect, it } from "vitest";
import { hasPlacement, pickLive, promotionStatus } from "./live";

const base = { active: true, startsAt: null, endsAt: null, priority: 0, updatedAt: 1, placements: ["sticker"] };
const NOW = 1_000;

describe("promotions live window", () => {
  it("classifies status", () => {
    expect(promotionStatus({ ...base, active: false }, NOW)).toBe("off");
    expect(promotionStatus({ ...base, startsAt: NOW + 1 }, NOW)).toBe("scheduled");
    expect(promotionStatus({ ...base, endsAt: NOW }, NOW)).toBe("ended");
    expect(promotionStatus({ ...base, startsAt: NOW, endsAt: NOW + 1 }, NOW)).toBe("live");
  });

  it("orders by priority then recency and drops non-live", () => {
    const rows = [
      { ...base, id: "old", updatedAt: 1 },
      { ...base, id: "new", updatedAt: 2 },
      { ...base, id: "top", priority: 5 },
      { ...base, id: "ended", endsAt: 10 },
    ];
    expect(pickLive(rows, NOW).map((r) => r.id)).toEqual(["top", "new", "old"]);
  });

  it("matches placements", () => {
    expect(hasPlacement(base, "sticker")).toBe(true);
    expect(hasPlacement(base, "popup")).toBe(false);
  });
});
