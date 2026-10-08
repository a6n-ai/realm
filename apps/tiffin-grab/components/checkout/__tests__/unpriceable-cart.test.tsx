// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Checkout } from "../checkout";
import { enterAddress } from "./address-helper";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("@/app/(public)/checkout/actions", () => ({ confirmSubscription: vi.fn() }));
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: vi.fn().mockResolvedValue({ error: "Invalid duration" }),
  validatePostal: vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } }),
}));

const MEMBER = { fullName: "Jane Doe", email: "jane@example.com" };
const selections: WizardSelections = {
  planKey: "veg", mealSizeId: "msz_1", frequencyKey: "5_day", persons: 1, mealSlots: [],
  includeSaturday: false, includeSunday: false, durationWeeks: 5, startDate: "2026-07-20",
};

describe("checkout with a cart the server can't price", () => {
  afterEach(cleanup);

  it("shows the reason and an Edit plan way out, not a Retry that reloads forever", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    render(<Checkout defaultCountry="CA" prefill={MEMBER} />);
    await screen.findByLabelText(/phone/i);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "4165551234" } });
    await enterAddress("M5H 1A1");
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));

    expect(await screen.findByText("Invalid duration")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(sessionStorage.getItem("tiffin.checkout.price-reload")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/subscribe", expect.anything());
  });
});
