// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { NextItemCard, NextItemEmpty, NextItemSkeleton, type NextItemView } from "./next-item-card";
import { UpNextStrip, type UpNextTile } from "./up-next-strip";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

const owner = { current: "me", options: [{ value: "me", label: "Me", href: "/x?o=me" }] };
const view = (over: Partial<NextItemView> = {}): NextItemView => ({
  identity: <span>Priya</span>,
  facts: [["Plan", "Veg 4wk"], ["Quoted", null]],
  primary: <button type="button">Do it</button>,
  ...over,
});
const wrap = (ui: ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("NextItemCard", () => {
  it("shows queue arrows and one Skip when there is an item", () => {
    wrap(<NextItemCard title="Next lead" noun="lead" owner={owner} dueText="3 due" prevHref="/p" nextHref="/n" item={view()} empty={null} />);
    expect(screen.getByRole("heading", { name: "Next lead" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous lead" })).toHaveAttribute("href", "/p");
    expect(screen.getByRole("link", { name: "Skip" })).toHaveAttribute("href", "/n");
    expect(screen.getByText("3 due")).toBeInTheDocument();
  });

  it("drops null facts and renders the empty slot when there is no item", () => {
    const { unmount } = wrap(<NextItemCard title="Next lead" noun="lead" owner={owner} dueText="" item={view()} empty={null} />);
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.queryByText("Quoted")).toBeNull();
    unmount();
    wrap(<NextItemCard title="Next lead" noun="lead" owner={owner} dueText="" item={null} empty={<NextItemEmpty title="All clear" detail="0 upcoming" />} />);
    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Skip" })).toBeNull();
  });

  it("renders the skeleton with the card title", () => {
    wrap(<NextItemSkeleton title="Next order" />);
    expect(screen.getByRole("heading", { name: "Next order" })).toBeInTheDocument();
  });
});

describe("UpNextStrip", () => {
  it("caps tiles at six, links each tile, and counts the rest", () => {
    const tiles: UpNextTile[] = Array.from({ length: 8 }, (_, i) => ({ key: `t${i}`, href: `/dashboard/inquiries?lead=t${i}`, title: `Lead ${i}` }));
    wrap(<UpNextStrip label="leads" tiles={tiles} more={2} viewAllHref="/all" />);
    const region = screen.getByRole("region", { name: "Up next leads" });
    expect(within(region).getAllByRole("link").filter((a) => a.getAttribute("href")?.includes("lead=")).length).toBe(6);
    expect(screen.getByText("Up next, 2 more")).toBeInTheDocument();
    expect(within(region).queryByRole("button")).toBeNull();
    expect(within(region).getByRole("group", { name: "Up next leads tiles" })).toBeInTheDocument();
  });
});
