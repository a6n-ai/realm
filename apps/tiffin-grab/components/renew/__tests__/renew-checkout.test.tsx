// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { initialSelections, WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import type { QuickRenewData } from "../types";
import "@/components/checkout/__tests__/address-helper";

const { repriceMock } = vi.hoisted(() => ({ repriceMock: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: repriceMock,
  validatePostal: vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } }),
}));
vi.mock("@/app/(public)/checkout/actions", () => ({ confirmSubscription: vi.fn(), payCheckout: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { RenewCheckout } from "../../../app/(customer)/me/renew/quick-renew-client";

const catalog = {
  plans: [{ key: "veg", name: "Veg", allowedStartDays: ["mon", "tue", "wed", "thu", "fri"] }],
  mealSizes: [{ publicId: "msz_1", name: "Medium Tiffin", planKey: "veg" }],
  frequencies: [],
  durations: [{ weeks: 1 }, { weeks: 4 }],
  zones: [],
  timezone: "America/Toronto",
} as unknown as ClientCatalogSnapshot;

const initial: WizardSelections = { ...initialSelections, planKey: "veg", mealSizeId: "msz_1", frequencyKey: "5day", eatingDays: ["mon", "tue"], durationWeeks: 4, startDate: "2030-02-04" };
const addr = (publicId: string, label: string, isDefault = false) => ({ publicId, label, addressLine: `${label} St`, addressUnit: null, city: "Toronto", province: null, postalCode: "M5V 2T6", deliveryInstructions: null, isDefault, fullName: null, lat: null, lng: null });
const data: QuickRenewData = {
  catalog, initial, sourceOrderPublicId: "ord_1", organizationId: "org_9", defaultPaymentMethodId: "stripe", minStartDate: "2030-02-04", lastTiffin: "2030-02-01",
  holidayDates: ["2030-02-06"], savedAddresses: [addr("adr_1", "Home", true), addr("adr_2", "Work")], addressDropOffs: {}, defaultAddressPublicId: "adr_1", tagColor: "#10b981", tagLabel: "Veg",
};
const checkout = {
  defaultCountry: "CA" as const,
  prefill: { fullName: "Jane Doe", phone: "4165551234", email: "jane@example.com" },
  catalog,
  savedAddresses: data.savedAddresses,
};

const priced = (total: number) => ({
  pricing: { lineItems: [], adjustments: [], tiffinCount: 8, perTiffinPrice: 10, subtotal: total, total },
  appliedCoupons: [], paymentMethods: [], coinBalance: null, coinsToEarn: null,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-02-01T17:00:00Z"));
  repriceMock.mockReset();
  repriceMock.mockResolvedValue(priced(123.45));
  router.push.mockClear();
  sessionStorage.clear();
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

const ui = () => <RenewCheckout data={data} checkout={checkout} />;
const current = () => screen.getByRole("navigation", { name: "Progress" }).querySelector('[aria-current="step"]')!.textContent ?? "";
const cont = async () => {
  const btn = await screen.findByRole("button", { name: "Continue" });
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(btn);
};

describe("RenewCheckout", () => {
  it("opens on Plan: plan card, heading, Progress at Plan, one Continue", async () => {
    render(ui());
    expect(screen.getByTestId("plan-card")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Renew your plan." })).toBeTruthy();
    expect(current()).toContain("Plan");
    expect(screen.getAllByRole("button", { name: "Continue" })).toHaveLength(1);
    await screen.findAllByText("$123.45");
  });

  it("prices with the server-default method and the source org; reprices on new weeks", async () => {
    render(ui());
    await waitFor(() => expect(repriceMock).toHaveBeenCalled());
    const a = repriceMock.mock.calls.find((c) => c[8] === "org_9")!;
    expect(a[3]).toBe("stripe");
    await screen.findAllByText("$123.45");
    fireEvent.change(screen.getByRole("slider", { name: "Commitment length" }), { target: { value: "0" } });
    await waitFor(() => expect(repriceMock.mock.calls.at(-1)![0]).toMatchObject({ durationWeeks: 1 }));
  });

  it("will not pick a holiday or a non delivery day", () => {
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /start date/i }));
    expect(screen.getByRole("button", { name: /Wednesday, February 6/ }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: /Saturday, February 9/ }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: /Thursday, February 7/ }).getAttribute("aria-disabled")).toBeNull();
  });

  it("Continue opens Delivery in place: no navigation, no storage, plan card gone", async () => {
    render(ui());
    await cont();
    await screen.findByRole("heading", { name: "Where should we deliver?" });
    expect(screen.queryByTestId("plan-card")).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
    expect(current()).toContain("Delivery");
  });

  it("reprices with the plan's weeks on Continue", async () => {
    render(ui());
    await screen.findAllByText("$123.45");
    repriceMock.mockResolvedValue(priced(77.5));
    await cont();
    await waitFor(() => expect(repriceMock.mock.calls.at(-1)![0]).toMatchObject({ durationWeeks: 4 }));
  });

  it("Back on Delivery returns to Plan with the same picks; editing weeks carries to the next Continue", async () => {
    render(ui());
    await cont();
    await screen.findByRole("heading", { name: "Where should we deliver?" });
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[0]!);
    await screen.findByTestId("plan-card");
    expect(screen.getByRole("slider", { name: "Commitment length" }).getAttribute("aria-valuetext")).toMatch(/^4 weeks/);
    fireEvent.change(screen.getByRole("slider", { name: "Commitment length" }), { target: { value: "0" } });
    await cont();
    await screen.findByRole("heading", { name: "Where should we deliver?" });
    await waitFor(() => expect(repriceMock.mock.calls.at(-1)![0]).toMatchObject({ durationWeeks: 1 }));
    expect(screen.getAllByRole("radio", { name: /Home/ })[0]!.getAttribute("aria-checked")).toBe("true");
  });

  it("Back on Plan leaves to /me", async () => {
    render(ui());
    await screen.findAllByText("$123.45");
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[0]!);
    expect(router.push).toHaveBeenCalledWith("/me", expect.anything());
  });

  it("Edit in the order summary goes back to Plan from Delivery", async () => {
    render(ui());
    await cont();
    await screen.findByRole("heading", { name: "Where should we deliver?" });
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    await screen.findByTestId("plan-card");
    expect(router.push).not.toHaveBeenCalled();
  });
});
