// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { initialSelections, type WizardSelections } from "@/components/wizard/selections";
import type { QuickRenewData } from "../types";

const { repriceMock } = vi.hoisted(() => ({ repriceMock: vi.fn() }));
vi.mock("@/app/(public)/subscribe/actions", () => ({ reprice: repriceMock }));

import { QuickRenewForm } from "../quick-renew-form";

const catalog = {
  plans: [{ key: "veg", name: "Veg", allowedStartDays: ["mon", "tue", "wed", "thu", "fri"] }],
  mealSizes: [{ publicId: "msz_1", name: "Medium Tiffin", planKey: "veg" }],
  frequencies: [],
  durations: [{ weeks: 1 }, { weeks: 4 }],
  zones: [],
  timezone: "America/Toronto",
} as unknown as ClientCatalogSnapshot;

const initial: WizardSelections = { ...initialSelections, planKey: "veg", mealSizeId: "msz_1", frequencyKey: "5day", eatingDays: ["mon", "tue"], durationWeeks: 4, startDate: "2030-02-04" };
const addr = (publicId: string, label: string) => ({ publicId, label, addressLine: `${label} St`, addressUnit: null, city: "Toronto", province: null, postalCode: "M5V 2T6", deliveryInstructions: null, isDefault: false, fullName: null, lat: null, lng: null });
const data: QuickRenewData = {
  catalog, initial, sourceOrderPublicId: "ord_1", organizationId: "org_9", defaultPaymentMethodId: "stripe", minStartDate: null, lastTiffin: "2030-02-01",
  holidayDates: ["2030-02-06"], savedAddresses: [addr("adr_1", "Home"), addr("adr_2", "Work")], addressDropOffs: {}, defaultAddressPublicId: "adr_1", tagColor: "#10b981", tagLabel: "Veg",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-02-01T17:00:00Z"));
  repriceMock.mockReset();
  repriceMock.mockResolvedValue({ pricing: { total: 123.45 } });
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

const form = (p: Partial<Parameters<typeof QuickRenewForm>[0]> = {}) =>
  <QuickRenewForm {...data} variant="customer" submitLabel="Pay now" onSubmit={vi.fn().mockResolvedValue(null)} changePlanHref="/me/renew?full=1" {...p} />;

describe("QuickRenewForm", () => {
  it("renders prefilled picks on one screen, no stepper", async () => {
    render(form());
    expect(screen.getByText("Medium Tiffin")).toBeTruthy();
    expect(screen.getByRole("button", { name: /start date/i }).textContent).toContain("Feb");
    expect((screen.getByRole("radio", { name: /4wk/ }) as HTMLInputElement | HTMLElement).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    expect(screen.getByText("Starts right after your current plan ends")).toBeTruthy();
    await screen.findByText("$123.45");
  });

  it("prices with the server-default payment method and the source order's org", async () => {
    render(form());
    await waitFor(() => expect(repriceMock).toHaveBeenCalled());
    const a = repriceMock.mock.calls.at(-1)!;
    expect(a[3]).toBe("stripe");
    expect(a[8]).toBe("org_9");
  });

  it("reprices with the new weeks", async () => {
    render(form());
    await screen.findByText("$123.45");
    fireEvent.click(screen.getByRole("radio", { name: /1wk/ }));
    await waitFor(() => expect(repriceMock.mock.calls.at(-1)![0]).toMatchObject({ durationWeeks: 1 }));
  });

  it("will not pick a holiday or a non delivery day", () => {
    render(form());
    fireEvent.click(screen.getByRole("button", { name: /start date/i }));
    const holiday = screen.getByRole("button", { name: /Wednesday, February 6/ });
    const weekend = screen.getByRole("button", { name: /Saturday, February 9/ });
    expect(holiday.getAttribute("aria-disabled")).toBe("true");
    expect(holiday.getAttribute("aria-label")).toContain("We are closed that day");
    expect(weekend.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: /Thursday, February 7/ }).getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(holiday);
  });

  it("submits the selections and address; shows a returned error", async () => {
    const onSubmit = vi.fn().mockResolvedValue("Card declined");
    render(form({ onSubmit }));
    const pay = await screen.findByRole("button", { name: "Pay now" });
    await waitFor(() => expect((pay as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(pay);
    await screen.findByText("Card declined");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ durationWeeks: 4, startDate: "2030-02-04" }), "adr_1");
  });

  it("admin variant has no change-plan link; customer does", () => {
    const { unmount } = render(form());
    expect(screen.getByText("Change meal or days")).toBeTruthy();
    unmount();
    render(form({ variant: "admin" }));
    expect(screen.queryByText("Change meal or days")).toBeNull();
  });

  it("stays locked after a successful submit so a second tap cannot double-order", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(form({ onSubmit }));
    const pay = await screen.findByRole("button", { name: "Pay now" });
    await waitFor(() => expect((pay as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(pay);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(pay);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Pay now" }) as HTMLButtonElement).disabled || screen.getByRole("button", { name: "Pay now" }).getAttribute("aria-disabled") === "true").toBe(true);
  });

  it("hands the current picks to onUseNewAddress, customer only", () => {
    const onUseNewAddress = vi.fn();
    const { unmount } = render(form({ onUseNewAddress }));
    fireEvent.click(screen.getByRole("button", { name: "Use a different address" }));
    expect(onUseNewAddress).toHaveBeenCalledWith(expect.objectContaining({ durationWeeks: 4 }));
    unmount();
    render(form({ variant: "admin", onUseNewAddress }));
    expect(screen.queryByRole("button", { name: "Use a different address" })).toBeNull();
  });

  it("admin shell prices, picks weeks and submits", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(form({ variant: "admin", onSubmit }));
    await screen.findByText("$123.45");
    fireEvent.click(screen.getByRole("radio", { name: "1 weeks" }));
    await waitFor(() => expect(repriceMock.mock.calls.at(-1)![0]).toMatchObject({ durationWeeks: 1 }));
    await screen.findByText("$123.45");
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ durationWeeks: 1 }), "adr_1"));
  });
});
