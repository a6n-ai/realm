import { describe, expect, it } from "vitest";
import { friendOffer, friendOfferParts, referCardPath, shareMessage } from "../share";

const flat = { mode: "flat" as const, referrerValue: 60, friendValue: 60, maxPerReferrer: null };

describe("friendOffer", () => {
  it("prices flat coins when a rate is set", () => {
    expect(friendOffer(flat, { perCoin: 0.25, currency: "CAD" })).toBe("60 coins ($15.00) on your first plan");
    expect(friendOffer(flat, null)).toBe("60 coins on your first plan");
  });

  it("says percent back for pct mode, and nothing while the friend side is off", () => {
    expect(friendOffer({ ...flat, mode: "pct", friendValue: 5 }, null)).toBe("5% back on your first plan");
    expect(friendOffer({ ...flat, friendValue: 0 }, null)).toBeNull();
  });
});

describe("shareMessage", () => {
  it("puts the code in the hook and the link on its own last line", () => {
    const msg = shareMessage("ABC234", "https://x/subscribe?ref=ABC234", "60 coins on your first plan");
    expect(msg).toContain("Get 60 coins on your first plan with my code ABC234.");
    expect(msg.split("\n").at(-1)).toBe("https://x/subscribe?ref=ABC234");
    expect(shareMessage("ABC234", "l", null)).toContain("Use my code ABC234");
  });
});

describe("friendOfferParts", () => {
  it("leads with money when a rate is set, else coins", () => {
    expect(friendOfferParts(flat, { perCoin: 0.25, currency: "CAD" })).toEqual({ big: "$15.00", small: "60 coins in your wallet" });
    expect(friendOfferParts(flat, null)).toEqual({ big: "60 coins", small: "in your wallet" });
    expect(friendOfferParts({ ...flat, friendValue: 0 }, null)).toBeNull();
  });
});

describe("referCardPath", () => {
  it("adds only the params that change the image", () => {
    expect(referCardPath("ABC234")).toBe("/api/refer-card/ABC234");
    expect(referCardPath("ABC234", { theme: "light" })).toBe("/api/refer-card/ABC234");
    expect(referCardPath("ABC234", { size: "og", theme: "dark" })).toBe("/api/refer-card/ABC234?size=og&theme=dark");
  });
});
