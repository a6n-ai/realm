import { describe, expect, it } from "vitest";
import { WALLET_FACETS } from "@/components/customer/wallet/wallet-facets";

describe("WALLET_FACETS", () => {
  it("offers earned/spent direction facet", () => {
    const dir = WALLET_FACETS.find((f) => "field" in f && f.field === "direction");
    expect(dir).toBeTruthy();
  });
});
