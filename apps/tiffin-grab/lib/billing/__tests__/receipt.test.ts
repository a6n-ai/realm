import { describe, expect, it } from "vitest";
import { signedReceiptUrl, verifyReceiptSignature } from "../receipt-link";
import { renderReceiptPdf } from "../receipt-pdf";
import type { Receipt } from "../receipt";

const parts = (u: string) => {
  const url = new URL(u, "https://x.test");
  return { exp: url.searchParams.get("exp"), sig: url.searchParams.get("sig") };
};

describe("receipt link", () => {
  const now = 1_800_000_000_000;
  process.env.BETTER_AUTH_URL ??= "https://app.test";
  it("verifies its own signature until it expires", () => {
    const { exp, sig } = parts(signedReceiptUrl("ord_1", now));
    expect(verifyReceiptSignature("ord_1", exp, sig, now)).toBe(true);
    expect(verifyReceiptSignature("ord_1", exp, sig, now + 8 * 24 * 3600_000)).toBe(false);
  });
  it("rejects another order, a changed expiry, or no signature", () => {
    const { exp, sig } = parts(signedReceiptUrl("ord_1", now));
    expect(verifyReceiptSignature("ord_2", exp, sig, now)).toBe(false);
    expect(verifyReceiptSignature("ord_1", String(Number(exp) + 1), sig, now)).toBe(false);
    expect(verifyReceiptSignature("ord_1", exp, null, now)).toBe(false);
  });
});

describe("renderReceiptPdf", () => {
  it("renders a PDF", async () => {
    const r: Receipt = {
      orderPublicId: "ord_1", code: "TG-1001", orderedAt: 1_790_000_000_000, issuedAt: 1_790_000_000_000,
      currency: "CAD", timezone: "America/Toronto",
      business: { name: "TiffinGrab", address: "1 Main St, Toronto" },
      customer: { name: "Asha", email: "a@example.test", address: "2 King St, Toronto, M5V 1A1" },
      plan: { title: "Regular · Veg", startDate: "2026-10-26", lastDate: "2026-11-20", weeks: 4, tiffins: 20 },
      lines: [{ label: "20 tiffins", amount: 200 }, { label: "Coupon SAVE10", amount: -20 }],
      taxLines: [{ label: "HST 13%", amount: 23.4 }],
      orderTotal: 203.4,
      payments: [{ date: 1_790_000_000_000, method: "Visa ••4242", reference: "pi_123", amount: 208.9, cardFee: 5.5, refunded: 10, status: "paid" }],
      cardFees: 5.5, paid: 208.9, refunded: 10, balanceDue: 0,
    };
    const bytes = await renderReceiptPdf(r);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });
});
