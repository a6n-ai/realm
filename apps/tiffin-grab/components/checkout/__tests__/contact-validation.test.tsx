// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IDENTITY_KEY, WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
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
    paymentMethods: [],
    coinBalance: null,
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
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify({ email: "jane@example.com", kind: "guest" }));
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

  it("uses the gate email, read-only, so Continue needs only the other fields", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify({ email: "jane@example.com", kind: "guest" }));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(email.value).toBe("jane@example.com");
    expect(email.readOnly).toBe(true);
    expect((screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "4165551234" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "12345" } });
    expect((screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Continue when the stored gate email is not a valid address", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify({ email: "not-an-email", kind: "guest" }));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "4165551234" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "12345" } });

    expect(
      (screen.getByRole("button", { name: /continue to payment/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
