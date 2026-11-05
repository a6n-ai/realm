import { describe, expect, it } from "vitest";
import { referHeadline } from "../refer-content";

const base = { on: true, maxPerReferrer: 30, pillLabel: null, friendCoins: 60 };
const f = (big: string) => ({ big, small: "" });

describe("referHeadline", () => {
  it("names each side's own figure", () => {
    expect(referHeadline({ ...base, friend: f("$15"), referrer: f("$15") })).toBe("Give $15, get $15.");
    expect(referHeadline({ ...base, friend: f("$10"), referrer: f("5%") })).toBe("Give $10, get 5%.");
  });
  it("speaks for the one side that pays", () => {
    expect(referHeadline({ ...base, friend: f("$15"), referrer: null })).toBe("Give your friends $15.");
    expect(referHeadline({ ...base, friend: null, referrer: f("60 coins") })).toBe("Get 60 coins for every friend.");
  });
});
