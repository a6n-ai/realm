// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedAddress } from "@foundry/address";

const actions = {
  createMyAddress: vi.fn(),
  updateSavedAddress: vi.fn(),
  setMyDefaultAddress: vi.fn(),
  archiveMyAddress: vi.fn(),
};
vi.mock("@/app/(customer)/me/account/address-actions", () => ({
  createMyAddress: (...a: unknown[]) => actions.createMyAddress(...a),
  updateSavedAddress: (...a: unknown[]) => actions.updateSavedAddress(...a),
  setMyDefaultAddress: (...a: unknown[]) => actions.setMyDefaultAddress(...a),
  archiveMyAddress: (...a: unknown[]) => actions.archiveMyAddress(...a),
}));

const { AddressBook } = await import("../address-book");

const saved = (publicId: string, label: string, isDefault = false): SavedAddress => ({
  publicId, label, fullName: null, addressLine: `${label} St`, addressUnit: null, city: "Toronto",
  province: null, postalCode: "M5V 2T6", deliveryInstructions: null, isDefault, lat: null, lng: null,
});
const BOOK = [saved("adr_home", "Home", true), saved("adr_work", "Work")];

describe("AddressBook", () => {
  afterEach(cleanup);
  beforeEach(() => Object.values(actions).forEach((f) => f.mockReset()));

  it("lists addresses with a Default badge on the default only", () => {
    render(<AddressBook initial={BOOK} />);
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getAllByText("Default")).toHaveLength(1);
    // The default has no delete control.
    expect(screen.queryByRole("button", { name: /delete home/i })).toBeNull();
  });

  it("confirms before deleting, naming where upcoming deliveries move", async () => {
    actions.archiveMyAddress.mockResolvedValue({ movedToDefault: true });
    render(<AddressBook initial={BOOK} />);
    fireEvent.click(screen.getByRole("button", { name: /delete work/i }));
    expect(screen.getByText(/upcoming deliveries here will move to home/i)).toBeTruthy();
    expect(actions.archiveMyAddress).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^delete address$/i }));
    await waitFor(() => expect(actions.archiveMyAddress).toHaveBeenCalledWith("adr_work"));
    await waitFor(() => expect(screen.queryByText("Work")).toBeNull());
  });

  it("a failed make-default shows the error and keeps the old default", async () => {
    actions.setMyDefaultAddress.mockRejectedValue(new Error("Server said no"));
    render(<AddressBook initial={BOOK} />);
    fireEvent.click(screen.getByRole("button", { name: /make work the default/i }));
    await waitFor(() => expect(screen.getByText("Server said no")).toBeTruthy());
    const home = screen.getByText("Home").closest("[data-address]")!;
    expect(home.textContent).toContain("Default");
  });

  it("a refused save keeps the sheet open and shows the reason inside it", async () => {
    actions.createMyAddress.mockResolvedValue({ error: "We don't deliver to K1A 0B1" });
    render(<AddressBook initial={BOOK} />);
    fireEvent.click(screen.getByRole("button", { name: /add address/i }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: /save address/i }));
    await waitFor(() => expect(within(sheet).getByText("We don't deliver to K1A 0B1")).toBeTruthy());
  });

  it("a refused delete shows the reason inside the confirm sheet", async () => {
    actions.archiveMyAddress.mockResolvedValue({ error: "Upcoming deliveries still use this address" });
    render(<AddressBook initial={BOOK} />);
    fireEvent.click(screen.getByRole("button", { name: /delete work/i }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: /^delete address$/i }));
    await waitFor(() => expect(within(sheet).getByText("Upcoming deliveries still use this address")).toBeTruthy());
  });
});
