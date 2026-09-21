// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomBar, CoinChip, EmptyState, ListRow, NavPill, PageHeader, SelectableCard, StatTile, TabBar, ThemeToggle } from "..";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock("@foundry/themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));

afterEach(cleanup);

describe("PageHeader", () => {
  it("renders h1 with italic accent and the action", () => {
    render(<PageHeader eyebrow="Meals" title="Your" accent="deliveries." action={<button>New</button>} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your deliveries.");
    expect(screen.getByText("deliveries.").tagName).toBe("EM");
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});

describe("SelectableCard", () => {
  it("exposes aria-pressed and fires on click and keyboard-activation target", () => {
    const onClick = vi.fn();
    render(<SelectableCard selected title="Veg" onClick={onClick} />);
    const b = screen.getByRole("button", { name: /Veg/ });
    expect(b).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalled();
  });
});

describe("ThemeToggle", () => {
  it("announces current and next theme and cycles light, dark, system", () => {
    const onChange = vi.fn();
    render(<ThemeToggle value="light" onChange={onChange} />);
    const b = screen.getByRole("button", { name: "Theme: light. Switch to dark" });
    fireEvent.click(b);
    expect(onChange).toHaveBeenCalledWith("dark");
    cleanup();
    render(<ThemeToggle value="system" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Switch to light/ }));
    expect(onChange).toHaveBeenLastCalledWith("light");
  });
});

describe("nav", () => {
  it("NavPill marks the current page", () => {
    render(<NavPill href="/me" active>Home</NavPill>);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });
  it("CoinChip is a labelled link with active state", () => {
    render(<CoinChip href="/me/wallet" balance={12} active />);
    const l = screen.getByRole("link", { name: "Finances, 12 coins" });
    expect(l).toHaveAttribute("href", "/me/wallet");
    expect(l).toHaveAttribute("aria-current", "page");
  });
  it("TabBar is a labelled nav", () => {
    render(<TabBar items={[{ href: "/a", label: "A", icon: null, active: true }, { href: "/b", label: "B", icon: null }]} />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "A" })).toHaveAttribute("aria-current", "page");
  });
  it("BottomBar shows its note as status", () => {
    render(<BottomBar note="Pick a size"><button>Next</button></BottomBar>);
    expect(screen.getByRole("status")).toHaveTextContent("Pick a size");
  });
});

describe("content", () => {
  it("ListRow with href is a link", () => {
    render(<ListRow label="Profile" href="/me/profile" />);
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/me/profile");
  });
  it("StatTile and EmptyState render text", () => {
    render(<><StatTile label="Left" value={12} unit="tiffins" /><EmptyState title="Nothing yet" body="Order one" /></>);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nothing yet" })).toBeInTheDocument();
  });
});
