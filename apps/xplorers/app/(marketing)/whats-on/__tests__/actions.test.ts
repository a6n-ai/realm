import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ user: { id: "usr_code_guess", role: "user" } }),
}));
const quote = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/discounts.service", () => ({ discountsService: { quoteForOccurrence: quote } }));
const createForUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/bookings.service", () => ({ bookingsService: { createForUser } }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createBookingAction, quoteBookingAction } = await import("../actions");

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

describe("createBookingAction", () => {
  it("books without the code once the guess limit is spent, so bookings cannot be used to probe codes", async () => {
    createForUser.mockResolvedValue({ paymentPublicId: "pay_1", codeError: null });
    const fd = new FormData();
    fd.set("occurrencePublicId", "occ_1");
    fd.set("code", "GUESS99");
    await expect(createBookingAction({}, fd)).rejects.toThrow("REDIRECT /me/pay/pay_1");
    expect(createForUser).toHaveBeenCalledWith("usr_code_guess", "occ_1", 1, { code: null, useCoins: false });
  });
});

describe("use my coins", () => {
  it("passes the coins choice to the preview and the booking", async () => {
    quote.mockClear();
    quote.mockResolvedValue({ subtotal: 10, adjustments: [], discountTotal: 0, taxTotal: 0, total: 10, codeError: null, currency: "CAD" });
    await quoteBookingAction("occ_2", 1, "", true);
    expect(quote).toHaveBeenCalledWith("occ_2", 1, "", "usr_code_guess", true);

    createForUser.mockClear();
    createForUser.mockResolvedValue({ paymentPublicId: null, codeError: null });
    const fd = new FormData();
    fd.set("occurrencePublicId", "occ_2");
    fd.set("useCoins", "on");
    await expect(createBookingAction({}, fd)).rejects.toThrow("REDIRECT /me");
    expect(createForUser).toHaveBeenCalledWith("usr_code_guess", "occ_2", 1, { code: "", useCoins: true });
  });
});
