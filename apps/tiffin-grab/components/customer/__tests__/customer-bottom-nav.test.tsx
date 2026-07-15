// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockPathname = "/me";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
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

  it("renders a Meals tab to /me/meals", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Meals/i })).toHaveAttribute("href", "/me/meals");
  });

  it("renders a Wallet tab to /me/wallet", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Wallet/i })).toHaveAttribute("href", "/me/wallet");
  });
});
