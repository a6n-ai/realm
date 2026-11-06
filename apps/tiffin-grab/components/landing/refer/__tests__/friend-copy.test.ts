import { describe, expect, it } from "vitest";
import { friendGiftLine, friendHeadline } from "../friend-copy";

describe("friendHeadline", () => {
  it("names the referrer and their gift", () => {
    expect(friendHeadline("Priya", { big: "$15" })).toBe("Priya gave you $15.");
    expect(friendHeadline("Priya", { big: "60 coins" })).toBe("Priya gave you 60 coins.");
  });
  it("says back for a percent reward", () => {
    expect(friendHeadline("Priya", { big: "5%" })).toBe("Priya gave you 5% back.");
  });
  it("falls back to a friend with no first name on file", () => {
    expect(friendHeadline(null, { big: "$15" })).toBe("A friend gave you $15.");
  });
});

describe("friendGiftLine", () => {
  it("says how each kind of gift arrives", () => {
    expect(friendGiftLine({ big: "$15" })).toBe("$15 in coins, added to your wallet after your first paid order.");
    expect(friendGiftLine({ big: "60 coins" })).toBe("60 coins, added to your wallet after your first paid order.");
    expect(friendGiftLine({ big: "5%" })).toBe("5% of your first plan back in coins, once it's paid.");
  });
});
