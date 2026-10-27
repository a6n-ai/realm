// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Wizard } from "../wizard";
import type { WizardSelections } from "../selections";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

const mockRouter = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/(public)/checkout/actions", () => ({ confirmSubscription: vi.fn(), payCheckout: vi.fn() }));
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: vi.fn().mockResolvedValue({
    pricing: { lineItems: [], adjustments: [], tiffinCount: 5, perTiffinPrice: 10, subtotal: 50, total: 50, taxTotal: 0 },
    appliedCoupons: [],
    paymentMethods: [],
    coinBalance: null,
    coinsToEarn: null,
  }),
  validatePostal: vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } }),
}));
// The builder's steps are covered elsewhere; this only needs the last step's button to be live.
vi.mock("../selections", async (orig) => ({
  ...(await orig<typeof import("../selections")>()),
  nextBlockedReason: () => null,
  firstBlockedStep: () => null,
  reconcileSelections: (_c: unknown, s: unknown) => s,
}));
vi.mock("../steps/step-baseline", () => ({ StepBaseline: () => null }));
vi.mock("../steps/step-bundle", () => ({ StepBundle: () => null }));
vi.mock("../steps/step-schedule", () => ({ StepSchedule: () => null }));
vi.mock("../steps/step-duration", () => ({ StepDuration: () => <p>duration step</p> }));
vi.mock("../best-deal", () => ({ BestDeal: () => null }));

const picks: WizardSelections = {
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
const catalog = { plans: [], mealSizes: [], frequencies: [], durations: [] } as unknown as ClientCatalogSnapshot;
const checkout = { defaultCountry: "CA" as const, prefill: { fullName: "Jane Doe", email: "jane@example.com" } };

describe("Wizard with an inline checkout", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); });

  it("opens Delivery in place, and Back returns to the last step with picks intact", async () => {
    render(<Wizard catalog={catalog} closeHref="/me" origin="renew" quote={{ picks, codes: [] }} checkout={checkout} />);
    fireEvent.click(screen.getByRole("button", { name: /continue to checkout/i }));
    expect(await screen.findByText("Where should we deliver?")).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /^back$/i })[0]!);
    expect(await screen.findByText("duration step")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue to checkout/i })).toBeTruthy();
  });

  it("still navigates to /checkout when no checkout props were loaded", () => {
    render(<Wizard catalog={catalog} closeHref="/me" origin="renew" quote={{ picks, codes: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: /continue to checkout/i }));
    expect(mockRouter.push).toHaveBeenCalledWith("/checkout", expect.anything());
  });
});
