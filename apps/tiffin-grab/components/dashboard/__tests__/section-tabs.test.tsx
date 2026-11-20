// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavAccessProvider } from "@/components/dashboard/nav-access-provider";
import { SECTIONS } from "../app-sidebar";
import { SectionTabs } from "../section-tabs";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const ALL_HREFS = SECTIONS.flatMap((s) => s.items.flatMap((i) => i.children ?? [i])).map((i) => i.href);

function renderAt(pathname: string, hrefs: readonly string[] = ALL_HREFS) {
  nav.pathname = pathname;
  return render(
    <NavAccessProvider hrefs={hrefs}>
      <SectionTabs />
    </NavAccessProvider>,
  );
}

const sections = SECTIONS.flatMap((s) => s.items).filter((i) => i.children);

afterEach(cleanup);

describe("SectionTabs", () => {
  it("renders nothing for a section with a single page", () => {
    renderAt("/dashboard/analytics");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("shows the section's pages as tabs on every page of that section", () => {
    for (const section of sections.filter((s) => (s.children?.length ?? 0) > 1)) {
      for (const child of section.children ?? []) {
        const { unmount } = renderAt(child.href);
        const tabs = screen.getByRole("navigation", { name: section.title });
        expect(within(tabs).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(
          (section.children ?? []).map((c) => c.href),
        );
        unmount();
      }
    }
  });

  it("renders nothing on pages outside every section", () => {
    renderAt("/dashboard/orders");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("marks the current page's tab", () => {
    renderAt("/dashboard/menus");
    expect(screen.getByRole("link", { name: "Weekly Menus" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Catalog" })).not.toHaveAttribute("aria-current");
  });

  it("drops tabs the caller may not open", () => {
    renderAt("/dashboard/menus", ALL_HREFS.filter((h) => h !== "/dashboard/menus"));
    const tabs = screen.getByRole("navigation", { name: "Kitchen" });
    expect(within(tabs).queryByRole("link", { name: "Weekly Menus" })).toBeNull();
    expect(within(tabs).getByRole("link", { name: "Daily labels" })).toBeInTheDocument();
  });

  it("renders nothing when every page of the section is disallowed", () => {
    renderAt("/dashboard/menus", ALL_HREFS.filter((h) => !h.startsWith("/dashboard/labels") && !h.startsWith("/dashboard/menus") && !h.startsWith("/dashboard/catalog")));
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
