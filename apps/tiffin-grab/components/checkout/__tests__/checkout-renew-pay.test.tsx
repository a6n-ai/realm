// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedAddress } from "@foundry/address";
import { RENEW_ADDRESS_KEY, RENEW_PAY_KEY, WIZARD_ORIGIN_KEY, WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { StrictMode } from "react";
import { validatePostal } from "@/app/(public)/subscribe/actions";
import { Checkout } from "../checkout";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
const confirmSubscription = vi.fn().mockResolvedValue({ waitlisted: false, deploymentId: "SUB-1", publicId: "ord_1" });
vi.mock("@/app/(public)/checkout/actions", () => ({ confirmSubscription: (...a: unknown[]) => confirmSubscription(...a) }));
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: vi.fn().mockResolvedValue({
    pricing: { lineItems: [], adjustments: [], tiffinCount: 5, perTiffinPrice: 10, subtotal: 50, total: 50 },
    appliedCoupons: [],
    paymentMethods: [],
    coinBalance: null,
    coinsToEarn: null,
  }),
  validatePostal: vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } }),
}));

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

describe("Checkout opened by Quick Renew", () => {
  afterEach(() => { cleanup(); confirmSubscription.mockClear(); });
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, "renew");
    sessionStorage.setItem(RENEW_PAY_KEY, "1");
    sessionStorage.setItem(RENEW_ADDRESS_KEY, "adr_work");
  });

  it("opens on Pay with the picked address and clears the flags", async () => {
    render(<Checkout defaultCountry="CA" prefill={PREFILL} savedAddresses={BOOK} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /continue to payment/i })).toBeNull());
    expect(sessionStorage.getItem(RENEW_PAY_KEY)).toBeNull();
    expect(sessionStorage.getItem(RENEW_ADDRESS_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /confirm subscription/i }));
    await waitFor(() => expect(confirmSubscription).toHaveBeenCalled());
    expect(confirmSubscription.mock.calls[0]![0]).toMatchObject({ addressPublicId: "adr_work", contact: { addressLine: "200 Bay St" } });
  });

  it("still lands on Pay with the picked address under StrictMode", async () => {
    render(<StrictMode><Checkout defaultCountry="CA" prefill={PREFILL} savedAddresses={BOOK} /></StrictMode>);
    await waitFor(() => expect(screen.queryByRole("button", { name: /continue to payment/i })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /confirm subscription/i }));
    await waitFor(() => expect(confirmSubscription).toHaveBeenCalled());
    expect(confirmSubscription.mock.calls[0]![0]).toMatchObject({ addressPublicId: "adr_work" });
  });

  it("stays on step 1 when the contact is incomplete", async () => {
    render(<Checkout defaultCountry="CA" prefill={{ ...PREFILL, fullName: "" }} savedAddresses={BOOK} />);
    expect(await screen.findByRole("button", { name: /continue to payment/i })).toBeTruthy();
    await waitFor(() => expect(validatePostal).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: /continue to payment/i })).toBeTruthy());
  });

  it("drops the pay intent when the zone check fails, so a later address change stays on step 1", async () => {
    vi.mocked(validatePostal).mockResolvedValue({ served: false } as never);
    render(<Checkout defaultCountry="CA" prefill={PREFILL} savedAddresses={[{ ...BOOK[0]!, postalCode: "M4C 1A1" }, BOOK[1]!]} />);
    await waitFor(() => expect(validatePostal).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: /continue to payment/i })).toBeTruthy());
    vi.mocked(validatePostal).mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } } as never);
    const before = vi.mocked(validatePostal).mock.calls.length;
    fireEvent.click((await screen.findAllByRole("radio", { name: /Home/ }))[0]!);
    await waitFor(() => expect(vi.mocked(validatePostal).mock.calls.length).toBeGreaterThan(before));
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByRole("button", { name: /continue to payment/i })).toBeTruthy();
  });
});
