// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/me/refer", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({ signOut: vi.fn() }));
vi.mock("@foundry/themes", async (orig) => ({ ...(await orig<object>()), useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));
vi.mock("@/components/motion/page-transition", () => ({ PageTransition: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/customer/support/unread", () => ({ useSupportUnread: () => 0 }));

vi.stubGlobal("EventSource", class { onmessage = null; close() {} });

const { CustomerShell } = await import("../customer-shell");

describe("CustomerShell Refer tab", () => {
  it("links to /me/refer and marks it current there", () => {
    render(<CustomerShell coinBalance={0} cutoffHour={18} userPublicId="usr_test">x</CustomerShell>);
    const links = screen.getAllByRole("link", { name: /refer/i });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l.getAttribute("href")).toBe("/me/refer");
    expect(links.some((l) => l.getAttribute("aria-current") === "page")).toBe(true);
  });
});
