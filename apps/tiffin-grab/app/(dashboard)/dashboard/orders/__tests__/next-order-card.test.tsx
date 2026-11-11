// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { TooltipProvider } from "@foundry/ui/tooltip";
import type { NextOrderReason, NextOrderRow } from "@/lib/services/next-order.service";
import { NextOrderCard, type NextOrderCardProps } from "../next-order-card";
vi.mock("../actions", () => ({ addOrderNoteAction: vi.fn(), emailPaymentLinkAction: vi.fn() }));
vi.mock("../[id]/actions", () => ({ verifyPaymentAction: vi.fn(), cancel: vi.fn(async () => undefined) }));
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
  status: "active",
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
const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);

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
  it("shows missed and flagged reasons with Open order as the primary and Add note as an icon", () => {
    const { unmount } = render(<NextOrderCard {...base({ row: order({ reason: "missed" }) })} />);
    expect(screen.getByText("Missed deliveries")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open order" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
    expect(screen.getByRole("button", { name: "Add note" })).toBeInTheDocument();
    unmount();
    render(<NextOrderCard {...base({ row: order({ reason: "flagged" }) })} />);
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open order" })).toBeInTheDocument();
  });
  it.each(["missed", "flagged"] as const)("gives a %s order with a payment no payment primary", (reason) => {
    render(<NextOrderCard {...base({ row: order({ reason, paymentPublicId: "pay_9", amount: 42 }) })} />);
    expect(screen.queryByRole("button", { name: /Verify payment|Send payment link/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open order" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
  });
  it("keeps one Open order control when a payment action is primary", () => {
    render(<NextOrderCard {...base({ row: order({ reason: "overdue", paymentPublicId: "pay_2", amount: 42 }) })} />);
    expect(screen.getAllByRole("link", { name: "Open order" })).toHaveLength(1);
  });
  it("shows the empty state with a link to Waiting on payment", () => {
    render(<NextOrderCard {...base({ row: null, queueCount: 0 })} />);
    expect(screen.getByText("No orders need attention.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Waiting on payment/ })).toHaveAttribute("href", "/dashboard/orders?view=payment");
  });
  it("renders at most six up-next cards, each linking to its order", () => {
    const up = Array.from({ length: 8 }, (_, i) => ({ ...order({ publicId: `ord_${i + 2}`, customerName: `Customer ${i}`, reason: "pending", paymentPublicId: `pay_${i}`, amount: 10 }), href: `/dashboard/orders?order=ord_${i + 2}` }));
    render(<NextOrderCard {...base({ upNext: up })} />);
    const strip = screen.getByRole("region", { name: "Up next orders" });
    const links = within(strip).getAllByRole("link", { name: /Customer \d/ });
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute("href", "/dashboard/orders?order=ord_2");
  });
});

describe("Cancel order on the Next order card", () => {
  it("offers Cancel only while the order can be cancelled, and calls cancel after confirming", async () => {
    const { cancel } = await import("../[id]/actions");
    const { unmount } = render(<NextOrderCard {...base({ row: order({ reason: "missed" }) })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("ord_1"));
    unmount();
    render(<NextOrderCard {...base({ row: order({ reason: "missed", status: "cancelled" }) })} />);
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });
});
