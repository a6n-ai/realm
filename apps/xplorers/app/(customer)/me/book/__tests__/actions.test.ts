import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@foundry/commons";

const session = vi.hoisted(() => ({ user: { id: "usr_family_a", role: "user" } as { id: string; role: string } | null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? { user: session.user } : null) }));
const bookings = vi.hoisted(() => ({ quote: vi.fn(), createForUser: vi.fn() }));
vi.mock("@/lib/services/bookings.service", () => ({ bookingsService: bookings }));
const kids = vi.hoisted(() => ({ createMine: vi.fn() }));
vi.mock("@/lib/services/children.service", () => ({ childrenService: kids }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const { bookAction, quoteAction, createChildAction } = await import("../actions");

const req = {
  occurrencePublicId: "occ_1",
  startsAt: "2026-11-02T02:00:00.000Z",
  choice: { kind: "length" as const, minutes: 60 },
  extensionSteps: 0,
  childPublicIds: ["chd_a1"],
  adults: 0,
};

beforeEach(() => {
  session.user = { id: "usr_family_a", role: "user" };
  vi.clearAllMocks();
});

describe("book actions", () => {
  it("another family's child comes back as an inline error, not a booking", async () => {
    bookings.createForUser.mockRejectedValueOnce(new ValidationError("Pick your own children."));
    await expect(bookAction({ ...req, childPublicIds: ["chd_other_family"] })).resolves.toEqual({
      error: "Pick your own children.",
    });
  });

  it("takes the family from the session and ignores amounts the client sends", async () => {
    bookings.createForUser.mockResolvedValueOnce({ paymentPublicId: "pay_1", codeError: null });
    await expect(bookAction({ ...req, total: 0, userPublicId: "usr_victim" } as never)).rejects.toThrow("REDIRECT:/me/pay/pay_1");
    expect(bookings.createForUser).toHaveBeenCalledWith("usr_family_a", {
      ...req,
      code: null,
      useCoins: false,
      methodId: undefined,
    });
  });

  it("a pending booking goes to its payment, a free one back to My classes", async () => {
    bookings.createForUser.mockResolvedValueOnce({ paymentPublicId: "pay_9", codeError: "not_found" });
    await expect(bookAction(req)).rejects.toThrow("REDIRECT:/me/pay/pay_9?codeError=not_found");
    bookings.createForUser.mockResolvedValueOnce({ paymentPublicId: null, codeError: null });
    await expect(bookAction(req)).rejects.toThrow("REDIRECT:/me/classes?booked=1");
  });

  it("a full session is an inline message", async () => {
    bookings.createForUser.mockRejectedValueOnce(new ValidationError("This session is full."));
    expect(await bookAction(req)).toEqual({ error: "This session is full." });
  });

  it("a malformed request is an inline error, not a crash", async () => {
    expect(await bookAction(null as never)).toEqual({ error: "Booking request is invalid." });
    expect(await quoteAction(undefined as never)).toEqual({ error: "Booking request is invalid." });
  });

  it("signed out or staff cannot quote, book or add children", async () => {
    session.user = null;
    expect(await quoteAction(req)).toEqual({ error: "Sign in to book." });
    expect(await bookAction(req)).toEqual({ error: "Sign in to book." });
    expect(await createChildAction({ name: "Ava", dateOfBirth: "2020-01-01" })).toEqual({ error: "Sign in to book." });
    session.user = { id: "usr_staff", role: "admin" };
    expect(await quoteAction(req)).toEqual({ error: "Sign in to book." });
    expect(bookings.quote).not.toHaveBeenCalled();
  });

  it("quote returns the server's total and lines", async () => {
    bookings.quote.mockResolvedValueOnce({
      total: 0,
      subtotal: 30,
      endsAt: new Date("2026-11-02T03:00:00Z"),
      perChild: 30,
      extensionPerChild: 0,
      extraAdults: 0,
      adultCharge: 0,
      lines: { subtotal: 30, adjustments: [], discountTotal: 0, taxTotal: 0, total: 0, codeError: null },
      currency: "SGD",
    });
    const out = await quoteAction(req);
    expect(bookings.quote).toHaveBeenCalledWith(expect.objectContaining({ occurrencePublicId: "occ_1" }), "usr_family_a");
    expect(out).toMatchObject({ quote: { total: 0, currency: "SGD", endsAt: "2026-11-02T03:00:00.000Z" } });
  });

  it("adds a child through the service and returns plain fields", async () => {
    kids.createMine.mockResolvedValueOnce({ publicId: "chd_n", name: "Ava", dateOfBirth: "2020-01-01", userId: 5n });
    expect(await createChildAction({ name: "Ava", dateOfBirth: "2020-01-01" })).toEqual({
      child: { publicId: "chd_n", name: "Ava", dateOfBirth: "2020-01-01" },
    });
    kids.createMine.mockRejectedValueOnce(new ValidationError("Date of birth is required."));
    expect(await createChildAction({ name: "Ava", dateOfBirth: "" })).toEqual({ error: "Date of birth is required." });
  });
});
