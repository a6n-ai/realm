// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const remove = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(customer)/me/account/card-actions", () => ({ removeSavedCard: (...a: unknown[]) => remove(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { SavedCards } = await import("../saved-cards");

const CARDS = [
  { paymentMethodId: "pm_1", brand: "visa", last4: "4242", expMonth: 3, expYear: 2029, isDefault: true },
  { paymentMethodId: "pm_2", brand: "mastercard", last4: "0005", expMonth: 11, expYear: 2027, isDefault: false },
];

describe("SavedCards", () => {
  afterEach(cleanup);
  beforeEach(() => { remove.mockReset().mockResolvedValue({ ok: true }); refresh.mockReset(); });

  it("lists brand, last4, expiry and one Default pill", () => {
    render(<SavedCards cards={CARDS} />);
    expect(screen.getByText(/Visa •••• 4242/)).toBeTruthy();
    expect(screen.getByText("Expires 03/29")).toBeTruthy();
    expect(screen.getByText(/Mastercard •••• 0005/)).toBeTruthy();
    expect(screen.getByText("Expires 11/27")).toBeTruthy();
    expect(screen.getAllByText("Default")).toHaveLength(1);
  });

  it("removes only after the confirm step", async () => {
    render(<SavedCards cards={CARDS} />);
    fireEvent.click(screen.getByRole("button", { name: /remove mastercard ending 0005/i }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("pm_2"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the empty state", () => {
    render(<SavedCards cards={[]} />);
    expect(screen.getByText("No saved cards. Cards you pay with are saved here for renewals.")).toBeTruthy();
  });
});
