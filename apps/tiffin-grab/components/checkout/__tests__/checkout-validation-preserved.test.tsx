// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Checkout } from "../checkout";

// Guardrail (Spec-B): the visual revamp of the checkout MUST NOT alter any
// validation gate. This locks the "Continue to payment" enable condition, the
// out-of-zone waitlist path, and the bad-coupon error state so a restyle that
// silently drops one of them fails here.

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("@/app/(public)/checkout/actions", () => ({ confirmSubscription: vi.fn() }));

const createWebsiteInquiry = vi.fn().mockResolvedValue({ ok: true, waitlisted: true });
vi.mock("@/app/(marketing)/contact/actions", () => ({
  createWebsiteInquiry: (...args: unknown[]) => createWebsiteInquiry(...args),
}));

const pricing = {
  lineItems: [],
  adjustments: [],
  tiffinCount: 5,
  perTiffinPrice: 10,
  tier: { minQty: 1, maxQty: null, upliftPct: 0 },
  subtotal: 50,
  total: 50,
};

// reprice returns a coupon error only when a (bad) code is supplied — mirrors the
// server action's contract that Checkout.applyCoupon depends on.
const reprice = vi.fn(async (...args: unknown[]) => ({
  pricing,
  appliedCoupons: [],
  couponError: args[1] ? "That code isn't valid." : undefined,
}));
const validatePostal = vi.fn();
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: (...args: unknown[]) => reprice(...args),
  validatePostal: (...args: unknown[]) => validatePostal(...args),
}));

const selections: WizardSelections = {
  planKey: "veg",
  mealSizeId: "msz_small_thali",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: [],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  startDate: "2026-07-20",
};

const continueBtn = () =>
  screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement;

describe("Checkout Spec-B validation gates (preserved through revamp)", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    createWebsiteInquiry.mockClear();
    validatePostal.mockReset();
  });

  it("gates Continue on fullName && phoneValid && emailValid && postalCode && zone-served", async () => {
    validatePostal.mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } });
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    expect(continueBtn().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "4165551234" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "12345" } });
    fireEvent.blur(screen.getByLabelText(/postal code/i));

    await waitFor(() => expect(continueBtn().disabled).toBe(false));
  });

  it("shows the waitlist path for an unserved postal and blocks Continue", async () => {
    validatePostal.mockResolvedValue({ served: false });
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "4165551234" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "99999" } });
    fireEvent.blur(screen.getByLabelText(/postal code/i));

    const waitlistBtn = await screen.findByRole("button", { name: /join waitlist/i });
    expect(continueBtn().disabled).toBe(true);

    fireEvent.click(waitlistBtn);
    await waitFor(() =>
      expect(createWebsiteInquiry).toHaveBeenCalledWith({
        fullName: "Jane Doe",
        phone: "+14165551234", // PhoneInput normalizes to E.164
        email: undefined,
        postalCode: "99999",
      }),
    );
    expect(await screen.findByText(/you.re on the waitlist/i)).toBeTruthy();
  });

  it("shows the coupon error state for a rejected code", async () => {
    validatePostal.mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } });
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/coupon code/i);
    fireEvent.change(screen.getByLabelText(/coupon code/i), { target: { value: "BOGUS" } });
    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));

    expect(await screen.findByText(/isn't valid/i)).toBeTruthy();
  });
});
