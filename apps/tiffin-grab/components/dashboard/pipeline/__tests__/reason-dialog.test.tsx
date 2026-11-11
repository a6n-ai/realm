// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReasonDialog } from "../reason-dialog";

const reasons: { value: string; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "other", label: "Other" },
];

afterEach(cleanup);

describe("ReasonDialog", () => {
  it("keeps Save disabled until a reason is picked, then saves the reason with the trimmed note", () => {
    const onSave = vi.fn();
    render(
      <ReasonDialog open onOpenChange={() => {}} pending={false} title="Lost reason" confirmLabel="Mark lost" reasons={reasons} onSave={onSave} />,
    );
    const save = screen.getByRole("button", { name: "Mark lost" });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Price" }));
    expect(save).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText("Note (optional)"), { target: { value: "  too costly  " } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith("price", "too costly");
  });
});
