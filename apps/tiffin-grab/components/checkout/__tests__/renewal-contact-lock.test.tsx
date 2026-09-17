// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WIZARD_ORIGIN_KEY,
  WIZARD_STORAGE_KEY,
  initialSelections,
  type WizardSelections,
} from "@/components/wizard/selections";
import { Checkout } from "../checkout";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// Must be ONE stable object: Checkout's mount effect depends on [router], so a
// fresh object per render re-runs the effect, which sets state and renders again
// — an infinite loop that exhausts the worker's heap.
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("@/app/(public)/checkout/actions", () => ({ confirmSubscription: vi.fn() }));
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: vi.fn().mockResolvedValue({
    pricing: {
      lineItems: [], adjustments: [], taxLines: [], taxTotal: 0,
      tiffinCount: 1, perTiffinPrice: 10, tier: { minQty: 1, maxQty: null, upliftPct: 0 },
      subtotal: 10, total: 10,
    },
    appliedCoupons: [],
    paymentMethods: [],
    coinBalance: null,
    coinCap: null,
  }),
  validatePostal: vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } }),
}));

const selections: WizardSelections = { ...initialSelections, planKey: "veg", mealSizeId: "msz_1", startDate: "2026-07-20" };

const onFile = {
  fullName: "Priya Shah",
  email: "priya@example.com",
  phone: "+14165551234",
  addressLine: "10 King St W",
  addressUnit: "402",
  city: "Toronto",
  postalCode: "M5H 1A1",
};

function field(label: RegExp) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("checkout contact on renewal", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("locks email and address for a logged-in renewal, pre-filled from the account", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, "renew");
    render(<Checkout defaultCountry="CA" prefill={onFile} />);

    await screen.findByText(/renewals use your account email/i);
    expect(field(/^email$/i).value).toBe("priya@example.com");
    expect(field(/^email$/i).readOnly).toBe(true);
    expect(field(/postal code/i).value).toBe("M5H 1A1");
    expect(field(/postal code/i).disabled).toBe(true);
    expect(screen.getByText(/renewals deliver to your saved address/i)).toBeTruthy();
  });

  it("keeps name, phone and delivery instructions editable on a renewal", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, "renew");
    render(<Checkout defaultCountry="CA" prefill={onFile} />);

    await screen.findByText(/renewals use your account email/i);
    expect(field(/full name/i).readOnly).toBe(false);
    expect(field(/full name/i).disabled).toBe(false);
    expect(field(/delivery instructions/i).disabled).toBe(false);
  });

  it("leaves everything editable for a new customer subscribing for the first time", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);

    await screen.findByLabelText(/full name/i);
    expect(field(/^email$/i).readOnly).toBe(false);
    expect(field(/postal code/i).disabled).toBe(false);
    expect(screen.queryByText(/renewals use your account email/i)).toBeNull();
  });

  it("does not lock a logged-in customer starting a new subscription (not a renewal)", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" prefill={onFile} />);

    await screen.findByLabelText(/full name/i);
    expect(field(/^email$/i).readOnly).toBe(false);
    expect(field(/postal code/i).disabled).toBe(false);
  });
});
