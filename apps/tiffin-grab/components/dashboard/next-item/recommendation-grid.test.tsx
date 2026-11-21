// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RECOMMENDATION_LIMIT, RecommendationGrid, RecommendationGridSkeleton, type RecommendationItem } from "./recommendation-grid";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

const owner = { current: "me", options: [{ value: "me", label: "Me", href: "/x?o=me" }] };
const item = (n: number): RecommendationItem => ({ key: `k${n}`, name: `Lead ${n}`, href: `/dashboard/inquiries/p${n}`, actions: <button type="button">Note {n}</button> });
const wrap = (items: RecommendationItem[], over: { error?: string } = {}) =>
  render(
    <RecommendationGrid title="Next leads" owner={owner} toAct={9} viewAllHref="/dashboard/inquiries?queue=open" items={items} empty={<p>All clear</p>} {...over} />,
  );

describe("RecommendationGrid", () => {
  it("shows at most the limit as cards, each opening its item", () => {
    const items = [1, 2, 3, 4].map(item);
    wrap(items);
    expect(screen.getAllByRole("link", { name: /^Lead \d$/ })).toHaveLength(RECOMMENDATION_LIMIT);
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
    expect(screen.getByRole("link", { name: "Lead 1" })).toHaveAttribute("href", "/dashboard/inquiries/p1");
    expect(screen.queryByText("Lead 4")).toBeNull();
    expect(screen.getByRole("button", { name: "Note 2" })).toBeInTheDocument();
  });

  it("header shows the to-act count and View all link", () => {
    wrap([item(1)]);
    expect(screen.getByText(/9 to act on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/dashboard/inquiries?queue=open");
  });

  it("renders the empty slot with no items and the Retry error in place of the grid", () => {
    const { unmount } = wrap([]);
    expect(screen.getByText("All clear")).toBeInTheDocument();
    unmount();
    wrap([item(1)], { error: "boom" });
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  });

  it("skeleton keeps the title and mirrors the one row: avatar, name, pill, meta line and three action squares, three times", () => {
    const { container } = render(<RecommendationGridSkeleton title="Next leads" />);
    expect(screen.getByRole("heading", { name: "Next leads" })).toBeInTheDocument();
    const cards = container.querySelectorAll('[data-slot="card"][data-size="sm"]');
    expect(cards).toHaveLength(3);
    cards.forEach((card) => expect(card.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7));
  });
});
