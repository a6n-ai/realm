import { describe, expect, it } from "vitest";
import { nameTaken } from "../address-name";

describe("nameTaken", () => {
  const others = [{ label: "Home" }, { label: "Office" }];
  it("flags a name another address has, ignoring case and spaces", () => {
    expect(nameTaken("  home ", others)).toBe('You already have an address called "Home"');
  });
  it("lets a new or empty name through", () => {
    expect(nameTaken("Mom's place", others)).toBeUndefined();
    expect(nameTaken("", others)).toBeUndefined();
  });
});
