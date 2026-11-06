import { describe, expect, it } from "vitest";
import { avatarColour, initials } from "../action-pill";

describe("initials", () => {
  it("takes first and last word", () => expect(initials("hrithik raj kumar")).toBe("HK"));
  it("takes two letters of a one-word name", () => expect(initials("Admin")).toBe("AD"));
  it("falls back for empty names", () => expect(initials("  ")).toBe("?"));
});

describe("avatarColour", () => {
  it("is stable for a name", () => expect(avatarColour("Ada Lovelace")).toBe(avatarColour("Ada Lovelace")));
  it("always picks a palette class", () => expect(avatarColour(null)).toMatch(/^bg-/));
});
