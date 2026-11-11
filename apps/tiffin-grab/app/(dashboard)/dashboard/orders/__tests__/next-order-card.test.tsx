// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { NextOrderReason, NextOrderRow } from "@/lib/services/next-order.service";
import { NextOrderCard, type NextOrderCardProps } from "../next-order-card";
vi.mock("../actions", () => ({ addOrderNoteAction: vi.fn(), emailPaymentLinkAction: vi.fn() }));
vi.mock("../[id]/actions", () => ({ verifyPaymentAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const NOW = Date.UTC(2026, 10, 11, 12);
const DAY = 86_400_000;
const order = (over: Partial<NextOrderRow> & { reason: NextOrderReason }): NextOrderRow => ({
  publicId: "ord_1",
  code: "TG-1001",
  customerName: "Asha Rao",
  phone: "4165550123",
  planName: "Veg Plan",
  mealSizeName: "Medium",
  paymentPublicId: null,
  amount: null,
  signalAt: NOW - 5 * DAY,
  ...over,
});
const base = (over: Partial<NextOrderCardProps> = {}): NextOrderCardProps => ({
  row: order({ reason: "flagged" }),
  currency: "CAD",
  now: NOW,
  queueCount: 3,
  owner: { current: "me", options: [{ value: "me", label: "Me", href: "/dashboard/orders?orderOwner=me" }] },
  upNext: [],
  attentionHref: "/dashboard/orders?view=payment",
  ...over,
});
afterEach(() => cleanup());
describe("Next order card", () => {
  it("shows the verify reason with the verify action only", () => {
    render(<NextOrderCard {...base({ row: order({ reason: "verify", paymentPublicId: "pay_1", amount: 42 }) })} />);
    expect(screen.getByText(/Payment to verify/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Verify payment/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send payment link/ })).not.toBeInTheDocument();
  });
  it("shows the overdue reason with days open and the payment link action", () => {
    render(<NextOrderCard {...base({ row: order({ reason: "overdue", paymentPublicId: "pay_2", amount: 42 }) })} />);
    expect(screen.getByText(/Payment overdue · 5d/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send payment link/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Verify payment/ })).not.toBeInTheDocument();
  });
  it("shows missed and flagged reasons with only note and open actions", () => {
    const { unmount } = render(<NextOrderCard {...base({ row: order({ reason: "missed" }) })} />);
    expect(screen.getByText("Missed deliveries")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Verify payment|Send payment link/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add note/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open order" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
    unmount();
    render(<NextOrderCard {...base({ row: order({ reason: "flagged" }) })} />);
    expect(screen.getByText("Flagged")).toBeInTheDocument();
  });
  it("shows the empty state with a link to Waiting on payment", () => {
    render(<NextOrderCard {...base({ row: null, queueCount: 0 })} />);
    expect(screen.getByText("No orders need attention.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Waiting on payment/ })).toHaveAttribute("href", "/dashboard/orders?view=payment");
  });
  it("renders at most six up-next cards, each linking to its order", () => {
    const up = Array.from({ length: 8 }, (_, i) => order({ publicId: `ord_${i + 2}`, customerName: `Customer ${i}`, reason: "pending", paymentPublicId: `pay_${i}`, amount: 10 }));
    render(<NextOrderCard {...base({ upNext: up })} />);
    const strip = screen.getByRole("region", { name: "Up next orders" });
    const links = within(strip).getAllByRole("link", { name: /Customer \d/ });
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute("href", "/dashboard/orders/ord_2");
  });
});
