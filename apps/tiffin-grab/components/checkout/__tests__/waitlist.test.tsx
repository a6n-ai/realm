// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Checkout } from "../checkout";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));
vi.mock("@/app/(public)/checkout/actions", () => ({
  confirmSubscription: vi.fn(),
}));
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: vi.fn().mockResolvedValue({
    pricing: {
      lineItems: [],
      adjustments: [],
      tiffinCount: 5,
      perTiffinPrice: 10,
      tier: { minQty: 1, maxQty: null, upliftPct: 0 },
      subtotal: 50,
      total: 50,
    },
    appliedCoupons: [],
  }),
  validatePostal: vi.fn().mockResolvedValue({ served: false }),
}));
const createWebsiteInquiry = vi.fn().mockResolvedValue({ ok: true, waitlisted: true });
vi.mock("@/app/(marketing)/contact/actions", () => ({
  createWebsiteInquiry: (...args: unknown[]) => createWebsiteInquiry(...args),
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

describe("Checkout postal-served gate + waitlist", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    createWebsiteInquiry.mockClear();
  });

  it("blocks Continue and offers Join waitlist for an unserved postal, then confirms on submit", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "4165551234" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "99999" } });
    fireEvent.blur(screen.getByLabelText(/postal code/i));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );

    const waitlistButton = await screen.findByRole("button", { name: /join waitlist/i });
    fireEvent.click(waitlistButton);

    await waitFor(() => expect(createWebsiteInquiry).toHaveBeenCalledWith({
      fullName: "Jane Doe",
      phone: "+14165551234", // PhoneInput normalizes to E.164
      email: "jane@example.com",
      postalCode: "99999",
    }));

    expect(await screen.findByText(/you.re on the waitlist/i)).toBeTruthy();
  });
});
