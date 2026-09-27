// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WIZARD_ORIGIN_KEY,
  WIZARD_STORAGE_KEY,
  initialSelections,
  type WizardSelections,
} from "@/components/wizard/selections";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { Checkout } from "../checkout";
import "./address-helper";

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

// Checkout is signed-in only (the page redirects signed-out visitors).
const MEMBER = { fullName: "Jane Doe", email: "jane@example.com" };

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

describe("checkout contact locking", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("locks name and email but keeps phone, address and instructions editable for a member", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, "renew");
    render(<Checkout defaultCountry="CA" prefill={onFile} />);

    // Name and email are the account's: shown, never an editable field or a "Change" link here.
    expect(await screen.findByText("Priya Shah")).toBeTruthy();
    expect(screen.getByText("priya@example.com")).toBeTruthy();
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
    expect(screen.queryByLabelText(/^email$/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /^change$/i })).toBeNull();
    // The phone is editable and prefilled from the account.
    expect(field(/^phone$/i).disabled).toBe(false);
    // The address on file is the picked card; tapping it again opens it for editing.
    const onFileCard = screen.getByRole("radio", { name: /address on file/i });
    expect(onFileCard.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(onFileCard);
    await screen.findByLabelText(/postal code/i);
    expect(field(/postal code/i).disabled).toBe(false);
    expect(field(/postal code/i).value).toBe("M5H 1A1");
    expect(field(/delivery instructions/i).disabled).toBe(false);
    expect(screen.getAllByText(/from your account/i).length).toBeGreaterThan(0);
  });

  it("sends a signed-out visitor back to the email step, replacing the checkout in history", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/subscribe"));
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
  });

  it("shows meal, baseline and delivery type in the summary", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ ...selections, frequencyKey: "f3" }));
    const catalog = {
      plans: [{ key: "veg", name: "Veg" }],
      mealSizes: [{ publicId: "msz_1", name: "Regular" }],
      frequencies: [{ key: "f3", name: "3 Days/Wk (Mon, Wed, Fri)", weekdays: ["mon", "wed", "fri"] }],
    } as unknown as ClientCatalogSnapshot;
    render(<Checkout defaultCountry="CA" prefill={MEMBER} catalog={catalog} />);

    await screen.findByText("Regular");
    expect(screen.getByText("Veg")).toBeTruthy();
    expect(screen.getByText("3 Days/Wk (Mon, Wed, Fri)")).toBeTruthy();
  });

  it("has one top Back (sm+) and one bottom Back (below sm) that share the handler label", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" prefill={MEMBER} />);
    await screen.findByLabelText(/phone/i);
    const backs = screen.getAllByRole("button", { name: "Edit plan" });
    expect(backs).toHaveLength(2);
    expect(backs.filter((b) => b.className.includes("sm:hidden"))).toHaveLength(1);
    expect(backs.filter((b) => b.className.includes("hidden") && b.className.includes("sm:!inline-flex"))).toHaveLength(1);
  });
});
