// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PhoneCallIcon } from "lucide-react";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { RowActionTooltipButton } from "../row-action-tooltip-button";

afterEach(cleanup);

const renderButton = (props: Partial<Parameters<typeof RowActionTooltipButton>[0]> = {}) =>
  render(
    <TooltipProvider>
      <RowActionTooltipButton icon={PhoneCallIcon} label="Log outcome" onClick={vi.fn()} {...props} />
    </TooltipProvider>,
  );

describe("RowActionTooltipButton", () => {
  it("shows the icon and stays enabled when not pending", () => {
    const { container } = renderButton();
    const button = screen.getByRole("button", { name: "Log outcome" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy");
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("renders a spinner in place of the icon and is disabled while pending", () => {
    const onClick = vi.fn();
    const { container } = renderButton({ pending: true, onClick });
    const button = screen.getByRole("button", { name: "Log outcome" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("button .animate-spin")).not.toBeNull();
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
