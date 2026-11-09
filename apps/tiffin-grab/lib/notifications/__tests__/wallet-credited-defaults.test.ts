import { describe, expect, it } from "vitest";
import { walletCreditedDefaults } from "../wallet-credited-template";

describe("walletCreditedDefaults", () => {
  it("keeps the wallet_credited copy", () => {
    expect(walletCreditedDefaults(25, "Staff gift")).toEqual({
      title: "You've got 25 TiffinGrab coins",
      body: "Staff gift — we've added 25 coins to your wallet. Use them at checkout on your next plan.",
    });
  });
  it("does not expand $ patterns in the reason", () => {
    expect(walletCreditedDefaults(1, "$& bonus").body.startsWith("$& bonus —")).toBe(true);
  });
});
