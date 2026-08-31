import { describe, it, expect } from "vitest";
import {
  parsePaymentConfig,
  enabledMethods,
  findMethod,
  DEFAULT_PAYMENT_CONFIG,
  type PaymentConfig,
} from "../index";

const sample: PaymentConfig = {
  methods: [
    { id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer",
      payeeHandle: "pay@tiffin.ca", instructions: "Send to the email", requireProof: true,
      taxes: [{ name: "GST", ratePct: 5 }] },
    { id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] },
  ],
};

describe("parsePaymentConfig", () => {
  it("returns the default (no methods) for empty/invalid input", () => {
    expect(parsePaymentConfig(undefined)).toEqual(DEFAULT_PAYMENT_CONFIG);
    expect(parsePaymentConfig({ methods: [{ id: "x" }] })).toEqual(DEFAULT_PAYMENT_CONFIG);
  });
  it("parses a valid config and applies field defaults", () => {
    const cfg = parsePaymentConfig(sample);
    expect(cfg.methods).toHaveLength(2);
    expect(cfg.methods[1].taxes).toEqual([]);
  });
});

describe("selectors", () => {
  it("enabledMethods returns only enabled", () => {
    expect(enabledMethods(sample).map((m) => m.id)).toEqual(["etransfer"]);
  });
  it("findMethod finds by id", () => {
    expect(findMethod(sample, "cash")?.label).toBe("Cash");
    expect(findMethod(sample, "nope")).toBeUndefined();
  });
});
