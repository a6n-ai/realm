// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecommendationCardFrame } from "./recommendation-card";
import type { RecommendationItem } from "./recommendation-grid";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

const item = { key: "k1", name: "Lead 1", href: "/dashboard/inquiries/p1" };
const entity: RecommendationItem = {
  key: "k2",
  name: "Lead 2",
  href: "/dashboard/inquiries/p2",
  reason: <span>Overdue · 9d ago</span>,
  status: <span>Responded</span>,
  actions: <button type="button">Log outcome</button>,
};

describe("RecommendationCardFrame entity row", () => {
  it("names the lead as its link with the meta line and status, and the actions beside them, with no Open button", () => {
    render(<RecommendationCardFrame item={entity} pending={false} />);
    expect(screen.getByRole("link", { name: "Lead 2" })).toHaveAttribute("href", "/dashboard/inquiries/p2");
    expect(screen.getByText("Overdue · 9d ago")).toBeInTheDocument();
    expect(screen.getByText("Responded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log outcome" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  });
});

describe("RecommendationCardFrame", () => {
  it("renders every item as the one row: avatar, name link, status and meta, with no Open link or contact row", () => {
    const { container } = render(<RecommendationCardFrame item={{ ...item, status: <span>Active</span>, reason: <span>Waiting</span> }} pending={false} />);
    expect(container.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lead 1" })).toHaveAttribute("href", "/dashboard/inquiries/p1");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  });

  it("dims, marks busy and shows a spinner while its refresh is pending", () => {
    const { container } = render(<RecommendationCardFrame item={item} pending />);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(container.firstElementChild).toHaveClass("opacity-60");
    expect(screen.getByRole("status", { name: "Updating" })).toBeInTheDocument();
  });

  it("is not busy at rest", () => {
    const { container } = render(<RecommendationCardFrame item={item} pending={false} />);
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
    expect(container.firstElementChild).not.toHaveClass("opacity-60");
    expect(screen.queryByRole("status", { name: "Updating" })).toBeNull();
  });
});
