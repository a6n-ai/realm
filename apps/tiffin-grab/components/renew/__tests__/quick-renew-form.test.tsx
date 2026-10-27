// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { initialSelections, type WizardSelections } from "@/components/wizard/selections";
import type { QuickRenewData } from "../types";

const { repriceMock } = vi.hoisted(() => ({ repriceMock: vi.fn() }));
vi.mock("@/app/(public)/subscribe/actions", () => ({ reprice: repriceMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }) }));

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
  catalog, initial, sourceOrderPublicId: "ord_1", organizationId: "org_9", defaultPaymentMethodId: "stripe", minStartDate: "2030-02-04", lastTiffin: "2030-02-01",
  holidayDates: ["2030-02-06"], savedAddresses: [addr("adr_1", "Home"), addr("adr_2", "Work")], addressDropOffs: {}, defaultAddressPublicId: "adr_1", tagColor: "#10b981", tagLabel: "Veg",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-02-01T17:00:00Z"));
  repriceMock.mockReset();
  repriceMock.mockResolvedValue({ pricing: { total: 123.45, tiffinCount: 8 } });
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

const form = (p: Partial<Parameters<typeof QuickRenewForm>[0]> = {}) =>
  <QuickRenewForm {...data} variant="admin" submitLabel="Pay now" onSubmit={vi.fn().mockResolvedValue(null)} {...p} />;

describe("QuickRenewForm", () => {
  it("admin shell prices, picks weeks and submits", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(form({ onSubmit }));
    await screen.findByText("$123.45");
    fireEvent.click(screen.getByRole("radio", { name: "1 weeks" }));
    await waitFor(() => expect(repriceMock.mock.calls.at(-1)![0]).toMatchObject({ durationWeeks: 1 }));
    await screen.findByText("$123.45");
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ durationWeeks: 1 }), "adr_1"));
  });

  it("has no change-plan link", () => {
    render(form());
    expect(screen.queryByText("Change meal or days")).toBeNull();
  });
});
