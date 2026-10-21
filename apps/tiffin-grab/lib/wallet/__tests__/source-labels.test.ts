import { describe, expect, it } from "vitest";
import { walletEntryLabel } from "../source-labels";

describe("walletEntryLabel", () => {
  it("names known sources", () => {
    expect(walletEntryLabel("order")).toBe("Earned on order");
    expect(walletEntryLabel("redemption_late")).toBe("Hold re-taken");
    expect(walletEntryLabel("manual_broadcast")).toBe("Staff grant");
    expect(walletEntryLabel("referral")).toBe("Referral reward");
  });

  it("uses the caller's fallback (event name) for sources it doesn't know", () => {
    expect(walletEntryLabel("signup", "Signup")).toBe("Signup");
  });

  it("falls back to the raw value", () => {
    expect(walletEntryLabel("seed")).toBe("seed");
  });
});
