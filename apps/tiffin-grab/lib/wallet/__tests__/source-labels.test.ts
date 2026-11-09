import { describe, expect, it } from "vitest";
import { walletEntryLabel } from "../source-labels";

describe("walletEntryLabel", () => {
  it("uses the caller's fallback (event name) for sources it doesn't know", () => {
    expect(walletEntryLabel("signup", "Signup")).toBe("Signup");
  });

  it("falls back to the raw value", () => {
    expect(walletEntryLabel("seed")).toBe("seed");
  });
});
