// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockPathname = "/me";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push }),
}));

import { CustomerBottomNav } from "../customer-bottom-nav";

afterEach(cleanup);

describe("CustomerBottomNav", () => {
  it("marks only Home active on /me (exact match, not startsWith)", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Home/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Deliveries/i })).not.toHaveAttribute("aria-current");
  });

  it("marks only Deliveries active on /me/deliveries (not Home too)", () => {
    mockPathname = "/me/deliveries";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Deliveries/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Home/i })).not.toHaveAttribute("aria-current");
  });

  it("renders a Menu tab to /me/menu", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Menu/i })).toHaveAttribute("href", "/me/menu");
  });

  it("renders a Wallet tab to /me/wallet", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Wallet/i })).toHaveAttribute("href", "/me/wallet");
  });

  it("renders 4 tabs (Home/Menu/Deliveries/Wallet), not Meals/Profile", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    ["Home", "Menu", "Deliveries", "Wallet"].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
    expect(screen.queryByText("Profile")).toBeNull();
    expect(screen.queryByText("Meals")).toBeNull();
  });

  it("Order FAB navigates to /subscribe", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    fireEvent.click(screen.getByRole("button", { name: /Order/i }));
    expect(push).toHaveBeenCalledWith("/subscribe");
  });
});
