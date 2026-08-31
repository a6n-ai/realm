import { describe, it, expect } from "vitest";
import { ManualProvider, providerFor, type PaymentMethodConfig } from "../index";

const method: PaymentMethodConfig = {
  id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer",
  payeeHandle: "pay@tiffin.ca", instructions: "Send an e-Transfer to the email above.",
  taxes: [],
};

describe("ManualProvider.initiate", () => {
  it("returns manual instructions with the payee handle and order reference", () => {
    const p = new ManualProvider("etransfer");
    const r = p.initiate({ orderRef: "ord_ABC", amount: 120, method });
    expect(r).toEqual({
      kind: "manual_instructions",
      instructions: "Send an e-Transfer to the email above.",
      payeeHandle: "pay@tiffin.ca",
      reference: "ord_ABC",
    });
  });
});

describe("providerFor", () => {
  it("returns a ManualProvider for a manual method", () => {
    expect(providerFor(method)).toBeInstanceOf(ManualProvider);
  });
  it("throws for an online method (no adapter yet)", () => {
    expect(() => providerFor({ ...method, kind: "online" })).toThrow(/not implemented/i);
  });
});
