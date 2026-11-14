// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "..";

afterEach(cleanup);

describe("Sheet", () => {
  it("renders a labelled modal dialog and locks scroll while open", () => {
    const { rerender } = render(<Sheet open onClose={() => {}} title="Hold">body</Sheet>);
    const d = screen.getByRole("dialog", { name: "Hold" });
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<Sheet open={false} onClose={() => {}} title="Hold">body</Sheet>);
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("Esc closes", () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T">x</Sheet>);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("traps Tab inside and restores focus on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { rerender } = render(
      <Sheet open onClose={() => {}} title="T" footer={<button>Last</button>}><button>First</button></Sheet>,
    );
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    rerender(<Sheet open={false} onClose={() => {}} title="T">x</Sheet>);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it("scrim click closes", () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T">x</Sheet>);
    fireEvent.click(screen.getByTestId("sheet-scrim"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
