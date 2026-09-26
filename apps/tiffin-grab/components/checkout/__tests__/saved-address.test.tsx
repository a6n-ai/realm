// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import type { SavedAddress } from "@foundry/address";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Checkout } from "../checkout";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// Stable router: Checkout has an effect keyed on [router]; a new object per call re-renders forever.
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
const confirmSubscription = vi.fn().mockResolvedValue({ waitlisted: false, deploymentId: "SUB-1", publicId: "ord_1" });
vi.mock("@/app/(public)/checkout/actions", () => ({ confirmSubscription: (...a: unknown[]) => confirmSubscription(...a) }));
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: vi.fn().mockResolvedValue({
    pricing: { lineItems: [], adjustments: [], tiffinCount: 5, perTiffinPrice: 10, tier: { minQty: 1, maxQty: null, upliftPct: 0 }, subtotal: 50, total: 50 },
    appliedCoupons: [],
    paymentMethods: [],
    coinBalance: null,
  }),
  validatePostal: vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } }),
}));

// Checkout is signed-in only (the page redirects signed-out visitors).
const MEMBER = { fullName: "Jane Doe", email: "jane@example.com" };

const selections: WizardSelections = {
  planKey: "veg", mealSizeId: "msz_small_thali", frequencyKey: "5_day", persons: 1, mealSlots: [],
  includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2026-07-20",
};
const saved = (publicId: string, label: string, addressLine: string, isDefault = false): SavedAddress => ({
  publicId, label, fullName: null, addressLine, addressUnit: null, city: "Toronto", province: null,
  postalCode: "M5V 2T6", deliveryInstructions: null, isDefault, lat: null, lng: null,
});
const BOOK = [saved("adr_home", "Home", "9 Bay St", true), saved("adr_work", "Work", "200 Bay St")];
const PREFILL = { fullName: "Jane Doe", phone: "4165551234", email: "jane@example.com" };

describe("Checkout with saved addresses", () => {
  // No vitest globals here, so Testing Library does not auto-clean between tests.
  afterEach(cleanup);
  beforeEach(() => {
    confirmSubscription.mockClear();
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
  });

  it("preselects the default and hides the address form", async () => {
    render(<Checkout defaultCountry="CA" prefill={PREFILL} savedAddresses={BOOK} />);
    const [home] = await screen.findAllByRole("radio", { name: /Home · Default/ });
    expect(home!.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryAllByLabelText(/street address/i)).toHaveLength(0);
  });

  it("'+ New address' shows the form; a saved pick is sent to confirm", async () => {
    render(<Checkout defaultCountry="CA" prefill={PREFILL} savedAddresses={BOOK} />);
    fireEvent.click((await screen.findAllByRole("radio", { name: /New address/ }))[0]!);
    expect(screen.queryAllByLabelText(/street address/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("radio", { name: /Work/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm subscription/i }));
    await waitFor(() => expect(confirmSubscription).toHaveBeenCalled());
    expect(confirmSubscription.mock.calls[0]![0]).toMatchObject({
      addressPublicId: "adr_work",
      contact: { addressLine: "200 Bay St", postalCode: "M5V 2T6" },
    });
  });

  it("with no saved address there is no picker, only the form", async () => {
    render(<Checkout defaultCountry="CA" prefill={MEMBER} />);
    expect((await screen.findAllByLabelText(/street address/i)).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("radiogroup", { name: /delivery address/i })).toHaveLength(0);
  });
});
