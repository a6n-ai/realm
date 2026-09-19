// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const saveItem = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/(dashboard)/dashboard/catalog/actions", () => ({ saveItem: (...a: unknown[]) => saveItem(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@foundry/ui/use-mobile", () => ({ useIsMobile: () => false }));

import { DiscountDialog } from "./discount-dialog";

const options = { frequencies: [{ publicId: "f1", name: "3 Days/Wk" }], durations: [{ publicId: "u1", weeks: 8 }] };
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
});
