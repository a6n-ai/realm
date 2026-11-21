// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneIcon, StickyNoteIcon } from "lucide-react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecommendationActions } from "./recommendation-actions";

afterEach(cleanup);

const open = () => fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });

describe("RecommendationActions", () => {
  it("renders primary actions as icon links or buttons and the rest under More actions", async () => {
    const onClick = vi.fn();
    const onSelect = vi.fn();
    render(
      <RecommendationActions
        primary={[
          { key: "call", icon: PhoneIcon, label: "Call Asha", href: "tel:1" },
          { key: "note", icon: StickyNoteIcon, label: "Log note", onClick },
        ]}
        more={[
          { key: "wa", label: "WhatsApp", ariaLabel: "WhatsApp Asha, 416 555 0123", href: "https://wa.me/1" },
          { key: "n", label: "Note", onSelect },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Call Asha" })).toHaveAttribute("href", "tel:1");
    fireEvent.click(screen.getByRole("button", { name: "Log note" }));
    expect(onClick).toHaveBeenCalledOnce();
    open();
    expect(await screen.findByRole("menuitem", { name: "WhatsApp Asha, 416 555 0123" })).toHaveAttribute("href", "https://wa.me/1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Note" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("marks a destructive menu item", async () => {
    render(<RecommendationActions primary={[]} more={[{ key: "cancel", label: "Cancel order", destructive: true, onSelect: vi.fn() }]} />);
    open();
    expect(await screen.findByRole("menuitem", { name: "Cancel order" })).toHaveAttribute("data-destructive");
  });

  it("leaves out More actions when there is nothing in it", () => {
    render(<RecommendationActions primary={[{ key: "n", icon: StickyNoteIcon, label: "Log note", onClick: vi.fn() }]} more={[]} />);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("disables a primary action while it is pending", () => {
    render(<RecommendationActions primary={[{ key: "n", icon: StickyNoteIcon, label: "Log note", onClick: vi.fn(), pending: true }]} more={[]} />);
    expect(screen.getByRole("button", { name: "Log note" })).toBeDisabled();
  });
});
