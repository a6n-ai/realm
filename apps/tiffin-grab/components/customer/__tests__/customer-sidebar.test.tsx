// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@realm/ui/sidebar";
import { TooltipProvider } from "@realm/ui/tooltip";

vi.mock("next/navigation", () => ({
  usePathname: () => "/me",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/auth/client", () => ({ signOut: vi.fn() }));

import { CustomerSidebar } from "../customer-sidebar";

afterEach(cleanup);

const user = { name: "Demo Customer", email: "demo@x.ca", image: null };

// Sidebar (from @realm/ui/sidebar) reads its collapsed/open state off
// SidebarContext via useSidebar(), and SidebarMenuButton's tooltip requires a
// TooltipProvider (normally supplied app-wide by app/layout.tsx) — both throw
// if missing, so the test mirrors the real render tree.
function renderSidebar() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <CustomerSidebar user={user} />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe("CustomerSidebar", () => {
  it("renders Home, Deliveries, and Account links to the right routes", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/me");
    expect(screen.getByRole("link", { name: /deliveries/i })).toHaveAttribute("href", "/me/deliveries");
    expect(screen.getByRole("link", { name: /account/i })).toHaveAttribute("href", "/me/account");
  });

  it("groups nav under admin-style section headings", () => {
    renderSidebar();
    for (const label of ["Overview", "Meals", "Finances", "Account"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("links Support under Account to /me/support", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /^support$/i })).toHaveAttribute("href", "/me/support");
  });
  it("marks Home active on exact /me only", () => {
    renderSidebar();
    // Home is active at pathname "/me"; Deliveries is not.
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: /deliveries/i })).not.toHaveAttribute("data-active", "true");
  });
});
