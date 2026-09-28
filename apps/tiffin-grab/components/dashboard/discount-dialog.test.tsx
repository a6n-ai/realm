// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const saveItem = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/(dashboard)/dashboard/catalog/actions", () => ({ saveItem: (...a: unknown[]) => saveItem(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@foundry/ui/use-mobile", () => ({ useIsMobile: () => false }));

import { DiscountDialog } from "./discount-dialog";

const options = { frequencies: [{ publicId: "f1", name: "3 Days/Wk" }], durations: [{ publicId: "u1", weeks: 8 }], mealSizes: [{ publicId: "m1", name: "Small" }] };
afterEach(() => { cleanup(); saveItem.mockClear(); });

describe("DiscountDialog", () => {
  it("locks the prefilled target", () => {
    render(<DiscountDialog open onOpenChange={() => {}} prefill={{ kind: "delivery", targetPublicId: "f1", lockTarget: true }} options={options} />);
    expect(screen.getByLabelText("Target")).toBeDisabled();
    expect(screen.getByLabelText("Applies to")).toBeDisabled();
  });

  it("rejects out-of-range percent without saving", async () => {
    render(<DiscountDialog open onOpenChange={() => {}} prefill={{ kind: "duration" }} options={options} />);
    fireEvent.change(screen.getByLabelText("Discount %"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Max 100%")).toBeInTheDocument();
    expect(saveItem).not.toHaveBeenCalled();
  });

  it("saves valid input through saveItem", async () => {
    const onSaved = vi.fn();
    render(<DiscountDialog open onOpenChange={() => {}} onSaved={onSaved} prefill={{ kind: "delivery", targetPublicId: "f1", lockTarget: true }} options={options} />);
    fireEvent.change(screen.getByLabelText("Discount %"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveItem).toHaveBeenCalled());
    expect(saveItem.mock.calls[0][0]).toBe("discounts");
    expect(saveItem.mock.calls[0][1]).toBeNull();
    expect(saveItem.mock.calls[0][2]).toMatchObject({ kind: "delivery", targetId: "f1", percent: "10" });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("saves a flat $ meal-size discount with percent 0 and no min weeks", async () => {
    // Radix Select calls these; jsdom lacks them.
    Element.prototype.scrollIntoView ??= vi.fn();
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    render(<DiscountDialog open onOpenChange={() => {}} prefill={{ kind: "meal_size", targetPublicId: "m1", lockTarget: true }} options={options} />);
    expect(screen.queryByLabelText("Min weeks (optional)")).toBeNull();
    fireEvent.click(screen.getByLabelText("Discount unit"));
    fireEvent.click(await screen.findByRole("option", { name: "$" }));
    fireEvent.change(screen.getByLabelText("Discount $ per tiffin"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveItem).toHaveBeenCalled());
    expect(saveItem.mock.calls[0][2]).toMatchObject({ kind: "meal_size", targetId: "m1", percent: "0", amount: "2", minWeeks: "" });
  });
});
