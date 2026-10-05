import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ user: { id: "usr_code_guess", role: "user" } }),
}));
const quote = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/discounts.service", () => ({ discountsService: { quoteForOccurrence: quote } }));
vi.mock("@/lib/services/bookings.service", () => ({ bookingsService: {} }));

const { quoteBookingAction } = await import("../actions");

describe("quoteBookingAction", () => {
  it("stops a family from guessing codes after too many tries", async () => {
    quote.mockResolvedValue({ subtotal: 10, adjustments: [], discountTotal: 0, taxTotal: 0, total: 10, codeError: "not_found", currency: "CAD" });
    for (let i = 0; i < 20; i++) {
      expect((await quoteBookingAction("occ_1", 1, `GUESS${i}`)).error).toBeUndefined();
    }
    expect((await quoteBookingAction("occ_1", 1, "GUESS21")).error).toMatch(/too many/i);
    expect(quote).toHaveBeenCalledTimes(20);
  });

  it("does not count previews without a code", async () => {
    quote.mockClear();
    expect((await quoteBookingAction("occ_1", 1, "")).error).toBeUndefined();
    expect(quote).toHaveBeenCalledTimes(1);
  });
});
