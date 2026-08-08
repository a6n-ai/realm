import { describe, it, expect } from "vitest";
import { PAYMENT_PROVIDERS, findPaymentProvider } from "../providers";

describe("PAYMENT_PROVIDERS", () => {
  it("ships exactly the three manual providers, in order", () => {
    expect(PAYMENT_PROVIDERS.map((p) => p.id)).toEqual(["etransfer", "cash", "manual"]);
  });

  it("seeds etransfer identically to the pre-move catalog", () => {
    expect(findPaymentProvider("etransfer")!.seed()).toEqual({
      id: "etransfer",
      kind: "manual",
      enabled: false,
      label: "Interac e-Transfer",
      taxes: [],
    });
  });

  it("seeds cash identically to the pre-move catalog", () => {
    expect(findPaymentProvider("cash")!.seed()).toEqual({
      id: "cash",
      kind: "manual",
      enabled: false,
      label: "Cash on delivery",
      taxes: [],
    });
  });

  it("seeds manual identically to the pre-move catalog", () => {
    expect(findPaymentProvider("manual")!.seed()).toEqual({
      id: "manual",
      kind: "manual",
      enabled: false,
      label: "Manual / Other",
      taxes: [],
    });
  });

  it("returns undefined for an unknown provider", () => {
    expect(findPaymentProvider("stripe")).toBeUndefined();
  });
});
