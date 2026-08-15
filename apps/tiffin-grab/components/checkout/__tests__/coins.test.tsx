// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Checkout } from "../checkout";

// Coins control mirrors the coupon control (checkout.tsx:358-374): apply → reprice
// → summary. Covers: hidden when signed out (coinBalance null), shown with a
// balance, a successful apply re-prices and shows the discount, and requesting
// more coins than the balance surfaces an inline error instead of silently
// applying nothing.

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("@/app/(public)/checkout/actions", () => ({ confirmSubscription: vi.fn() }));

const basePricing = {
  lineItems: [],
  adjustments: [] as { label: string; amount: number }[],
  taxLines: [],
  taxTotal: 0,
  tiffinCount: 5,
  perTiffinPrice: 10,
  tier: { minQty: 1, maxQty: null, upliftPct: 0 },
  subtotal: 50,
  total: 50,
};

// Mutable per-test so the reprice mock's "signed in" state can vary without
// re-mocking the module.
let coinBalance: number | null = 100;

// Mirrors the real reprice contract: caps the requested coins against the
// balance and folds a "Coins (N)" adjustment line into pricing, or returns
// coinsError when the request exceeds the balance.
const reprice = vi.fn(async (...args: unknown[]) => {
  const coins = args[4] as number | undefined;
  if (coins && coinBalance != null && coins > coinBalance) {
    return { pricing: basePricing, appliedCoupons: [], paymentMethods: [], coinBalance, coinsError: "You don't have that many coins." };
  }
  const adjustments = coins ? [{ label: `Coins (${coins})`, amount: coins }] : [];
  return {
    pricing: { ...basePricing, adjustments, total: basePricing.total - (coins ?? 0) },
    appliedCoupons: [],
    paymentMethods: [],
    coinBalance,
  };
});
const validatePostal = vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } });
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

const applyCoinsButton = () => screen.getAllByRole("button", { name: /^apply$/i })[1]!;

describe("Checkout coins control", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    reprice.mockClear();
    coinBalance = 100;
  });

  it("is absent — and a sign-in prompt shows instead — when signed out (coinBalance null)", async () => {
    coinBalance = null;
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    await waitFor(() => expect(reprice).toHaveBeenCalled());

    expect(screen.queryByLabelText(/use coins/i)).toBeNull();
    expect(screen.getByText(/sign in/i)).toBeTruthy();
  });

  it("appears with a balance", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    expect(await screen.findByLabelText(/use coins/i)).toBeTruthy();
    expect(screen.getByText(/100 available/i)).toBeTruthy();
  });

  it("applying coins re-prices and shows the discount in the summary", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    const coinsInput = await screen.findByLabelText(/use coins/i);
    fireEvent.change(coinsInput, { target: { value: "30" } });
    fireEvent.click(applyCoinsButton());

    expect(await screen.findByText(/coins applied/i)).toBeTruthy();
    // The Invoice renders result.adjustments — reprice already folds the coin
    // discount line into pricing, same as a coupon adjustment.
    expect(await screen.findByText(/coins \(30\)/i)).toBeTruthy();
    expect(screen.getByText(/−\$30\.00/)).toBeTruthy();
  });

  it("asking for more coins than the balance surfaces an error instead of silently applying", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    const coinsInput = await screen.findByLabelText(/use coins/i);
    fireEvent.change(coinsInput, { target: { value: "200" } });
    fireEvent.click(applyCoinsButton());

    expect(await screen.findByText(/don.t have that many coins/i)).toBeTruthy();
    expect(screen.queryByText(/coins \(200\)/i)).toBeNull();
  });
});
