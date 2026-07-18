// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
  validatePostal: vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } }),
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

describe("Checkout contact format validation", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("disables Continue with an invalid phone and shows an inline error", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "12345" } });

    expect(screen.getByText(/enter a valid phone number/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("requires email — Continue stays disabled until a valid email is entered", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "4165551234" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "12345" } });

    // Email is now required → empty email keeps Continue disabled.
    expect(
      (screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
    expect(screen.queryByText(/enter a valid phone number/i)).toBeNull();
    expect(
      (screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("disables Continue with an invalid non-empty email", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "4165551234" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "12345" } });

    expect(screen.getByText(/enter a valid email/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
