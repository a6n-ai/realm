import { describe, expect, it } from "vitest";
import { friendHeadline } from "../friend-copy";

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
