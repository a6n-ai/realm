// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CSSProperties, ReactNode } from "react";
import { SidebarProvider } from "@foundry/ui/sidebar";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { CrmShell } from "@foundry/crm/crm-shell";
import { NavAccessProvider } from "@/components/dashboard/nav-access-provider";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { MobileOnly } from "@/components/dashboard/mobile-only";
import { AppClock } from "@/components/dashboard/app-clock";
import { AppSidebar, SECTIONS } from "../app-sidebar";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@foundry/ui/use-mobile", () => ({ useIsMobile: () => viewport.mobile }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: () => {}, prefetch: () => {} }));
const search = vi.hoisted(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => router,
  useSearchParams: () => search,
}));
const searchHits = vi.hoisted(() => ({
  value: { orders: [], customers: [], inquiries: [], tickets: [] } as Record<string, unknown[]>,
}));
vi.mock("@/app/(dashboard)/dashboard/search-actions", () => ({
  globalSearch: async () => searchHits.value,
}));
vi.mock("@/lib/auth/client", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/auth/lock-actions", () => ({ lockSession: vi.fn() }));
// The path is split so vitest.config.ts does not route this file to the Postgres project.
vi.mock("@/lib/services" + "/section-seen.actions", () => ({ markAllReadAction: vi.fn() }));
vi.mock("@/components/brand-logo", () => ({
  BrandMark: () => null,
  BrandWordmark: () => <span>TiffinGrab</span>,
}));
vi.mock("@/components/app-currency", () => ({ useFormatMoney: () => (n: number) => `$${n}` }));

const FLAT = SECTIONS.flatMap((s) => s.items.flatMap((i) => i.children ?? [i]));
const ALL_HREFS = FLAT.map((i) => i.href);
const KITCHEN_HREFS = ["/dashboard/labels", "/dashboard/menus", "/dashboard/catalog"];
const COOKIE = "tg_sidebar_width";
const savedCookie = () =>
  document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.split("=")[1];

describe("sidebar nav filter", () => {
  it("leaves Roles to the Organization tabs", () => {
    expect(ALL_HREFS).not.toContain("/dashboard/organization/roles");
  });
});

describe("sidebar sections", () => {
  it("puts the seven core pages in the unlabelled primary section, in order", () => {
    const primary = SECTIONS.find((s) => s.variant === "primary");
    expect(primary?.items.map((i) => i.href)).toEqual([
      "/dashboard",
      "/dashboard/orders",
      "/dashboard/inquiries",
      "/dashboard/customers",
      "/dashboard/renewals",
      "/dashboard/dispatch",
      "/dashboard/tickets",
    ]);
  });

  it("has four section items, each linking to its first page with its pages as children", () => {
    const section = SECTIONS.find((s) => s.variant === "section");
    expect(section?.items.map((i) => i.title)).toEqual(["Kitchen", "Money", "Engage", "Insights"]);
    expect(section?.items.map((i) => i.href)).toEqual([
      "/dashboard/labels",
      "/dashboard/payments",
      "/dashboard/notifications",
      "/dashboard/analytics",
    ]);
    expect(section?.items.map((i) => i.children?.map((c) => c.title))).toEqual([
      ["Daily labels", "Weekly Menus", "Catalog"],
      ["Payments", "Wallet", "Discounts"],
      ["Notifications", "Customer groups"],
      ["Analytics"],
    ]);
  });

  it("pins Settings and Organization to the footer, and Account to the user menu", () => {
    expect(SECTIONS.find((s) => s.variant === "bottom")?.items.map((i) => i.title)).toEqual(["Settings", "Organization"]);
    expect(SECTIONS.find((s) => s.variant === "menu")?.items.map((i) => i.href)).toEqual(["/dashboard/account"]);
  });

  it("keeps every page href (global search and the more drawer read SECTIONS)", () => {
    expect([...ALL_HREFS].sort()).toEqual(
      [
        "/dashboard",
        "/dashboard/analytics",
        "/dashboard/inquiries",
        "/dashboard/orders",
        "/dashboard/labels",
        "/dashboard/dispatch",
        "/dashboard/renewals",
        "/dashboard/customers",
        "/dashboard/tickets",
        "/dashboard/catalog",
        "/dashboard/menus",
        "/dashboard/payments",
        "/dashboard/wallet",
        "/dashboard/discounts",
        "/dashboard/notifications",
        "/dashboard/customer-groups",
        "/dashboard/organization",
        "/dashboard/settings",
        "/dashboard/account",
      ].sort(),
    );
  });
});

// Mirrors the dashboard layout: CrmShell's provider gets the saved width as --sidebar-width.
function tree({
  hrefs = ALL_HREFS,
  pathname = "/dashboard",
  open = true,
  width = 255,
  clock,
}: { hrefs?: readonly string[]; pathname?: string; open?: boolean; width?: number; clock?: ReactNode } = {}) {
  nav.pathname = pathname;
  return (
    <NavAccessProvider hrefs={hrefs}>
      <SidebarProvider defaultOpen={open} style={{ "--sidebar-width": `${width}px` } as CSSProperties}>
        <AppSidebar
          user={{ email: "ana@example.com", role: "admin", name: "Ana", image: null }}
          hasPin={false}
          activity={null}
          initialWidth={width}
          search={<GlobalSearch role="admin" />}
          bell={<button type="button" aria-label="Notifications" />}
          clock={clock}
        />
      </SidebarProvider>
    </NavAccessProvider>
  );
}

function renderSidebar(opts?: Parameters<typeof tree>[0]) {
  return render(tree(opts));
}

const wrapper = () => document.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement;
const widthVar = () => wrapper().style.getPropertyValue("--sidebar-width");
const footer = () => document.querySelector('[data-slot="sidebar-footer"]') as HTMLElement;
const header = () => document.querySelector('[data-slot="sidebar-header"]') as HTMLElement;

beforeAll(() => {
  // jsdom has no pointer capture; the handle calls it on pointerdown.
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  // The command list scrolls the highlighted row into view; jsdom has no layout.
  Element.prototype.scrollIntoView ??= () => {};
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
});

beforeEach(() => {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppSidebar list", () => {
  it("renders primary items with no visible group label", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renewals" })).toBeInTheDocument();
    expect(screen.queryByText("Main")).toBeNull();
    expect(screen.queryByText("Operations")).toBeNull();
  });

  it("renders section items as buttons with no href, collapsed by default", () => {
    renderSidebar();
    for (const label of ["Kitchen", "Money", "Engage", "Insights"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).not.toHaveAttribute("href");
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByRole("link", { name: "Daily labels" })).toBeNull();
  });

  it("toggles a section's child links and aria-expanded when clicked", () => {
    renderSidebar();
    const kitchen = screen.getByRole("button", { name: "Kitchen" });
    fireEvent.click(kitchen);
    expect(kitchen).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Daily labels" })).toHaveAttribute("href", "/dashboard/labels");
    expect(screen.getByRole("link", { name: "Weekly Menus" })).toHaveAttribute("href", "/dashboard/menus");
    fireEvent.click(kitchen);
    expect(kitchen).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Daily labels" })).toBeNull();
  });

  it("controls the child list it opens", () => {
    renderSidebar();
    const kitchen = screen.getByRole("button", { name: "Kitchen" });
    fireEvent.click(kitchen);
    const panel = document.getElementById(kitchen.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByRole("link", { name: "Catalog" })).toBeInTheDocument();
  });

  it("renders child rows as sub-buttons with their icon in the section's colour", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    const child = screen.getByRole("link", { name: "Weekly Menus" });
    expect(child).toHaveAttribute("data-slot", "sidebar-menu-sub-button");
    expect(child).toHaveClass("text-footnote", "h-8");
    expect(child.querySelector("svg")).toHaveStyle({ color: "var(--chart-1)" });
    const kitchenIcon = screen.getByRole("button", { name: "Kitchen" }).querySelector("svg");
    expect(kitchenIcon).toHaveStyle({ color: "var(--chart-1)" });
  });

  it("rotates the chevron down while a section is open", () => {
    renderSidebar();
    const kitchen = screen.getByRole("button", { name: "Kitchen" });
    const chevron = () => kitchen.querySelectorAll("svg")[kitchen.querySelectorAll("svg").length - 1];
    expect(chevron()).not.toHaveClass("rotate-90");
    fireEvent.click(kitchen);
    expect(chevron()).toHaveClass("rotate-90");
  });

  it("starts a section open when one of its pages is active, with that child marked", () => {
    renderSidebar({ pathname: "/dashboard/analytics" });
    expect(screen.getByRole("button", { name: "Insights" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Kitchen" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
  });

  it("lets the user close an open section that holds the active page", () => {
    renderSidebar({ pathname: "/dashboard/analytics" });
    fireEvent.click(screen.getByRole("button", { name: "Insights" }));
    expect(screen.getByRole("button", { name: "Insights" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Analytics" })).toBeNull();
  });

  it("hides child pages the caller is not allowed to open", () => {
    renderSidebar({ hrefs: ALL_HREFS.filter((h) => h !== "/dashboard/menus") });
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    expect(screen.queryByRole("link", { name: "Weekly Menus" })).toBeNull();
    expect(screen.getByRole("link", { name: "Daily labels" })).toBeInTheDocument();
  });

  it("hides pages the caller may not open, and any section left empty", () => {
    renderSidebar({ hrefs: ["/dashboard", "/dashboard/orders"] });
    expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Renewals" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Kitchen" })).toBeNull();
  });

  it("reopens a section the user closed when they move to another page in it", () => {
    const view = renderSidebar({ pathname: "/dashboard/payments" });
    fireEvent.click(screen.getByRole("button", { name: "Money" }));
    expect(screen.getByRole("button", { name: "Money" })).toHaveAttribute("aria-expanded", "false");
    view.rerender(tree({ pathname: "/dashboard/wallet" }));
    expect(screen.getByRole("button", { name: "Money" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Wallet" })).toHaveAttribute("aria-current", "page");
  });

  it("puts the clock card in the footer above Settings", () => {
    renderSidebar({ clock: <span>Clock card</span> });
    const clock = within(footer()).getByText("Clock card");
    const settings = within(footer()).getByRole("link", { name: "Settings" });
    expect(clock.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sets a 1px divider between the primary list and the sections", () => {
    renderSidebar();
    expect(document.querySelector('[data-sidebar="separator"]')).toBeInTheDocument();
  });

  it("marks a section item active when one of its pages is open", () => {
    renderSidebar({ pathname: "/dashboard/analytics" });
    expect(screen.getByRole("button", { name: "Insights" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "Kitchen" })).toHaveAttribute("data-active", "false");
  });

  it("does not render a section whose pages are all disallowed", () => {
    renderSidebar({ hrefs: ALL_HREFS.filter((h) => !KITCHEN_HREFS.includes(h)) });
    expect(screen.queryByRole("button", { name: "Kitchen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Money" })).toBeInTheDocument();
  });

  it("renders no sidebar rail, so it cannot sit over the resize handle", () => {
    renderSidebar();
    expect(document.querySelector('[data-slot="sidebar-rail"]')).toBeNull();
  });

  it("puts Settings and Organization in the footer", () => {
    renderSidebar();
    expect(within(footer()).getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(within(footer()).getByRole("link", { name: "Organization" })).toBeInTheDocument();
  });

  it("puts the bell and a ⋯ user menu in the footer user row", () => {
    renderSidebar();
    expect(within(footer()).getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(footer()).getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("keeps Account out of the list and puts it in the ⋯ user menu", async () => {
    renderSidebar();
    const content = document.querySelector('[data-slot="sidebar-content"]') as HTMLElement;
    expect(within(content).queryByRole("link", { name: "Account" })).toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "Account" })).toHaveAttribute("href", "/dashboard/account");
  });

  it("collapses fully (offcanvas) rather than to icons", () => {
    renderSidebar({ open: false });
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute("data-collapsible", "offcanvas");
  });

  it("draws every sidebar icon at 16px with a 1.5 stroke", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    const icons = document.querySelectorAll('[data-slot="sidebar-content"] svg, [data-slot="sidebar-footer"] [data-slot="sidebar-menu"] svg');
    expect(icons).toHaveLength(20);
    for (const icon of icons) {
      expect(icon).toHaveClass("size-4");
      expect(icon).toHaveAttribute("stroke-width", "1.5");
    }
  });
});

describe("AppSidebar find", () => {
  beforeEach(() => {
    searchHits.value = { orders: [], customers: [], inquiries: [], tickets: [] };
  });

  const field = () => screen.getByRole("button", { name: "Find" });
  const panel = () => screen.getByRole("dialog", { name: "Find" });
  const input = () => within(panel()).getByRole("combobox");
  const open = () => fireEvent.keyDown(document.body, { key: "f" });
  const type = (value: string) => fireEvent.change(input(), { target: { value } });

  it("sits in the sidebar header as a field that opens the panel", () => {
    renderSidebar();
    expect(within(header()).getByRole("button", { name: "Find" })).toBe(field());
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(field());
    expect(input()).toBeInTheDocument();
  });

  it("opens the panel with the input focused on F when no field has focus", () => {
    renderSidebar();
    open();
    expect(document.activeElement).toBe(input());
    expect(input()).toHaveAttribute("placeholder", "Find");
  });

  it("opens on ⌘K", () => {
    renderSidebar();
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(input());
  });

  it("draws the search icon at 16px with a 1.5 stroke and an Esc hint", () => {
    renderSidebar();
    open();
    const command = input().closest('[data-slot="command"]');
    expect(command?.querySelector('[data-slot="input-group-addon"] svg')).toHaveClass("size-4");
    expect(command).toHaveClass("[&_[data-slot=input-group-addon]_svg]:[stroke-width:1.5]");
    expect(within(panel()).getByText("Esc")).toBeInTheDocument();
  });

  it("shows the nav pages as rows with the section as subtitle, no group headings", () => {
    renderSidebar();
    open();
    const orders = within(panel()).getByRole("option", { name: /Orders/ });
    expect(orders).toHaveTextContent("Navigation");
    expect(within(panel()).getByRole("option", { name: /Wallet/ })).toHaveTextContent("Money");
    expect(panel().querySelector("[data-slot=command-group-label]")).toBeNull();
  });

  it("maps entity hits to a title and an Order, Customer, Inquiry or Ticket subtitle", async () => {
    searchHits.value = {
      orders: [{ id: "o1", label: "Ana Rao", sub: "PAYTEST-2 · active", href: "/dashboard/orders/o1" }],
      customers: [{ id: "c1", label: "Bo Lee", sub: "bo@example.com", href: "/dashboard/customers/c1" }],
      inquiries: [{ id: "i1", label: "Cy Dee", sub: "555 · new", href: "/dashboard/inquiries/i1" }],
      tickets: [{ id: "t1", label: "Late box", sub: "Ana · open", href: "/dashboard/tickets/t1" }],
    };
    renderSidebar();
    open();
    type("pay");
    const row = await within(panel()).findByRole("option", { name: /Ana Rao/ });
    expect(row).toHaveTextContent("Order · PAYTEST-2 · active");
    expect(within(panel()).getByRole("option", { name: /Bo Lee/ })).toHaveTextContent("Customer · bo@example.com");
    expect(within(panel()).getByRole("option", { name: /Cy Dee/ })).toHaveTextContent("Inquiry · 555 · new");
    expect(within(panel()).getByRole("option", { name: /Late box/ })).toHaveTextContent("Ticket · Ana · open");
  });

  it("is a combobox whose aria-activedescendant follows ArrowDown", async () => {
    renderSidebar();
    open();
    expect(input()).toHaveAttribute("aria-autocomplete", "list");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    await waitFor(() => expect(input().getAttribute("aria-activedescendant")).toBeTruthy());
    const first = input().getAttribute("aria-activedescendant");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    await waitFor(() => expect(input().getAttribute("aria-activedescendant")).not.toBe(first));
  });

  it("moves with ArrowDown and opens that row on Enter", async () => {
    router.push.mockClear();
    renderSidebar();
    open();
    await waitFor(() => expect(within(panel()).getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    await waitFor(() => expect(within(panel()).getByRole("option", { name: /Orders/ })).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(router.push).toHaveBeenCalledWith("/dashboard/orders");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says when nothing matches", async () => {
    renderSidebar();
    open();
    type("zzzq");
    expect(await within(panel()).findByText("No results for “zzzq”")).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to where it was", () => {
    renderSidebar();
    const before = document.createElement("button");
    document.body.append(before);
    before.focus();
    open();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it("closes when the backdrop is clicked and refocuses the field", () => {
    renderSidebar();
    fireEvent.click(field());
    fireEvent.mouseDown(document.querySelector('[data-slot="find-backdrop"]') as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it("opens the collapsed sidebar, then the panel, on F", async () => {
    renderSidebar({ open: false });
    open();
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute("data-state", "expanded");
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it("keeps the collapsed sidebar out of the tab order and the accessibility tree", () => {
    renderSidebar({ open: false });
    expect(document.querySelector('[data-slot="sidebar-container"]')).toHaveAttribute("inert");
  });

  it("leaves the open sidebar interactive", () => {
    renderSidebar();
    expect(document.querySelector('[data-slot="sidebar-container"]')).not.toHaveAttribute("inert");
  });

  it("does not steal F from a focused menu item", () => {
    renderSidebar();
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("button");
    menu.append(item);
    document.body.append(menu);
    item.focus();
    fireEvent.keyDown(item, { key: "f" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(item);
    menu.remove();
  });

  it("ignores F while an IME composition is in progress", () => {
    renderSidebar();
    fireEvent.keyDown(document.body, { key: "f", isComposing: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not steal F while the user is typing in another field", () => {
    renderSidebar();
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();
    fireEvent.keyDown(other, { key: "f" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it("shows the F hint on the field", () => {
    renderSidebar();
    expect(within(field()).getByText("F")).toBeInTheDocument();
  });

  describe("panel placement", () => {
    const anchorAt = (left: number, top: number) =>
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        left,
        right: left + 200,
        top,
        bottom: top + 40,
        width: 200,
        height: 40,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect);
    const originalWidth = window.innerWidth;
    afterEach(() => {
      window.innerWidth = originalWidth;
    });

    it("covers the field in place: 24rem wide, 4px up and left of it, outside the sidebar", () => {
      window.innerWidth = 1200;
      anchorAt(20, 30);
      renderSidebar();
      open();
      expect(panel()).toHaveClass("fixed");
      expect(panel().style.width).toBe("384px");
      expect(panel().style.left).toBe("16px");
      expect(panel().style.top).toBe("26px");
      expect(panel().closest('[data-slot="sidebar-container"]')).toBeNull();
    });

    it("keeps the panel 4px inside the right edge of the viewport", () => {
      window.innerWidth = 500;
      anchorAt(300, 30);
      renderSidebar();
      open();
      expect(panel().style.left).toBe("112px");
    });

    it("narrows on a phone-width viewport and keeps 4px from both edges", () => {
      window.innerWidth = 300;
      anchorAt(300, 30);
      renderSidebar();
      open();
      expect(panel().style.width).toBe("292px");
      expect(panel().style.left).toBe("4px");
    });
  });

  describe("does not touch the list search", () => {
    afterEach(() => search.delete("q"));

    it("never writes the ?q= param a list's own search box reads", async () => {
      router.replace.mockClear();
      renderSidebar();
      open();
      type("ord");
      await new Promise((r) => setTimeout(r, 450));
      expect(router.replace).not.toHaveBeenCalled();
    });

    it("does not adopt a list's ?q= as its own text", () => {
      search.set("q", "abc");
      renderSidebar();
      open();
      expect(input()).toHaveValue("");
    });
  });
});

describe("AppSidebar width", () => {
  const handleOf = () => screen.getByRole("separator", { name: "Resize sidebar" });

  it("starts at the width the server rendered and does not rewrite it on mount", () => {
    renderSidebar({ width: 264 });
    expect(handleOf()).toHaveAttribute("aria-valuenow", "264");
    expect(widthVar()).toBe("264px");
    expect(savedCookie()).toBeUndefined();
  });

  it("defaults to 255px", () => {
    renderSidebar();
    expect(handleOf()).toHaveAttribute("aria-valuenow", "255");
    expect(widthVar()).toBe("255px");
  });

  it("points the handle at the sidebar it resizes", () => {
    renderSidebar();
    const id = handleOf().getAttribute("aria-controls") ?? "";
    expect(document.getElementById(id)).toHaveAttribute("data-slot", "sidebar-container");
  });

  it("follows the pointer while dragging, then saves the cookie on release", async () => {
    renderSidebar();
    const handle = handleOf();
    fireEvent.pointerDown(handle, { button: 0, clientX: 240 });
    fireEvent.pointerMove(handle, { clientX: 300 });
    expect(widthVar()).toBe("315px");
    expect(savedCookie()).toBeUndefined();
    fireEvent.pointerUp(handle, { clientX: 300 });
    await waitFor(() => expect(savedCookie()).toBe("315"));
    expect(handleOf()).toHaveAttribute("aria-valuenow", "315");
    expect(widthVar()).toBe("315px");
  });

  it("marks the wrapper while dragging so the width transition stops", () => {
    renderSidebar();
    const handle = handleOf();
    fireEvent.pointerDown(handle, { button: 0, clientX: 240 });
    expect(wrapper()).toHaveAttribute("data-resizing");
    fireEvent.pointerUp(handle, { clientX: 240 });
    expect(wrapper()).not.toHaveAttribute("data-resizing");
  });

  it("a click with under 3px of movement neither resizes nor saves", () => {
    renderSidebar();
    const handle = handleOf();
    fireEvent.pointerDown(handle, { button: 0, clientX: 240 });
    fireEvent.pointerMove(handle, { clientX: 242 });
    fireEvent.pointerUp(handle, { clientX: 242 });
    expect(widthVar()).toBe("255px");
    expect(savedCookie()).toBeUndefined();
  });

  it("a cancelled drag restores the last saved width and saves nothing", () => {
    renderSidebar();
    const handle = handleOf();
    fireEvent.pointerDown(handle, { button: 0, clientX: 240 });
    fireEvent.pointerMove(handle, { clientX: 300 });
    fireEvent.pointerCancel(handle, { clientX: 300 });
    expect(widthVar()).toBe("255px");
    expect(savedCookie()).toBeUndefined();
    expect(wrapper()).not.toHaveAttribute("data-resizing");
  });

  it("Escape during a drag restores the saved width and saves nothing", () => {
    renderSidebar();
    const handle = handleOf();
    fireEvent.pointerDown(handle, { button: 0, clientX: 240 });
    fireEvent.pointerMove(handle, { clientX: 300 });
    expect(widthVar()).toBe("315px");
    fireEvent.keyDown(handle, { key: "Escape" });
    expect(widthVar()).toBe("255px");
    fireEvent.pointerUp(handle, { clientX: 300 });
    expect(widthVar()).toBe("255px");
    expect(savedCookie()).toBeUndefined();
  });

  it("resizes with the arrow keys and saves the cookie", async () => {
    renderSidebar();
    const handle = handleOf();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    await waitFor(() => expect(widthVar()).toBe("263px"));
    expect(savedCookie()).toBe("263");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    await waitFor(() => expect(widthVar()).toBe("247px"));
    expect(savedCookie()).toBe("247");
  });

  it("Home and End jump to the minimum and maximum widths", async () => {
    renderSidebar();
    const handle = handleOf();
    fireEvent.keyDown(handle, { key: "Home" });
    await waitFor(() => expect(widthVar()).toBe("200px"));
    expect(savedCookie()).toBe("200");
    fireEvent.keyDown(handle, { key: "End" });
    await waitFor(() => expect(widthVar()).toBe("320px"));
    expect(savedCookie()).toBe("320");
  });
});

describe("shell header chrome", () => {
  const shellHeader = () => document.querySelector('header[class*="md:grid-cols"]') as HTMLElement;
  const shell = (mobile: boolean) => {
    viewport.mobile = mobile;
    return render(
      <TimezoneProvider tz="America/Toronto">
        <NavAccessProvider hrefs={ALL_HREFS}>
          <CrmShell
            hideSidebarOnMobile
            sidebar={
              <AppSidebar
                user={{ email: "ana@example.com", role: "admin", name: "Ana", image: null }}
                hasPin={false}
                activity={null}
                search={<GlobalSearch role="admin" />}
                orgSwitcher={<button type="button" aria-label="Switch organization" />}
                bell={<button type="button" aria-label="Notifications" />}
                clock={<AppClock cutoffHour={18} variant="card" />}
              />
            }
            center={
              <MobileOnly>
                <GlobalSearch role="admin" />
              </MobileOnly>
            }
            actions={
              <MobileOnly>
                <AppClock cutoffHour={18} />
                <button type="button" aria-label="Switch organization" />
                <button type="button" aria-label="Notifications" />
              </MobileOnly>
            }
          >
            body
          </CrmShell>
        </NavAccessProvider>
      </TimezoneProvider>,
    );
  };

  it("on mobile renders one search, one bell, one org switcher and one clock, all in the header", async () => {
    shell(true);
    expect(document.querySelectorAll('button[aria-label="Find"]')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-label="Notifications"]')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-label="Switch organization"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="sidebar-container"]')).toBeNull();
    expect(await screen.findAllByText(/Cutoff 6:00 pm/)).toHaveLength(1);
    expect(shellHeader().textContent).toMatch(/Cutoff 6:00 pm/);
  });

  it("on desktop keeps search, bell, org switcher and the clock card in the sidebar, not the header", async () => {
    shell(false);
    expect(document.querySelectorAll('button[aria-label="Find"]')).toHaveLength(1);
    expect(shellHeader().querySelector('[aria-label="Notifications"]')).toBeNull();
    expect(shellHeader().querySelector('[aria-label="Switch organization"]')).toBeNull();
    expect(shellHeader().textContent).not.toMatch(/Cutoff/);
    expect(within(footer()).getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(await within(footer()).findByText(/6:00 pm · in /)).toBeInTheDocument();
  });
});
