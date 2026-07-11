// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Checkout } from "../checkout";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));
vi.mock("@/app/(public)/checkout/actions", () => ({
  confirmSubscription: vi.fn().mockRejectedValue(new Error("Start date cannot be a weekend")),
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

describe("Checkout confirm() error handling", () => {
  beforeEach(() => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
  });

  it("surfaces a confirmSubscription failure as a toast, not an unhandled throw", async () => {
    render(<Checkout />);

    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "5551234567" } });
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: "12345" } });

    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));

    fireEvent.click(screen.getByRole("button", { name: /confirm subscription/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Start date cannot be a weekend"));
  });
});
