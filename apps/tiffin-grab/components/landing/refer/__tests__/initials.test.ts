import { describe, expect, it } from "vitest";
import { avatarColour } from "../action-pill";

describe("avatarColour", () => {
  it("is stable for a name", () => expect(avatarColour("Ada Lovelace")).toBe(avatarColour("Ada Lovelace")));
  it("always picks a palette class", () => expect(avatarColour(null)).toMatch(/^bg-/));
});
