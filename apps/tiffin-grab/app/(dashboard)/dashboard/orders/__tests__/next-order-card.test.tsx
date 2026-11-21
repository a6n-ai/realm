// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import type { NextOrderReason, NextOrderRow } from "@/lib/orders/next-order.service";
import { NextOrderCard, type NextOrderCardProps } from "../next-order-card";
vi.mock("../actions", () => ({ addOrderNoteAction: vi.fn() }));
vi.mock("../../_order/actions", () => ({ emailPaymentLinkAction: vi.fn() }));
vi.mock("../[id]/actions", () => ({ cancel: vi.fn(async () => ({ ok: true })) }));
vi.mock("../../payments/actions", () => ({ verifyPaymentAction: vi.fn() }));
vi.mock("@foundry/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
const render = (ui: React.ReactElement) => rtlRender(ui);

afterEach(() => cleanup());
const openMenu = () => fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });

describe("Next order card", () => {
  it("renders the order as the one row: avatar, name link, status pill, reason line, icon actions and More actions", async () => {
    const { container } = render(<NextOrderCard {...base({ row: order({ reason: "flagged" }) })} />);
    expect(container.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(screen.getByText("3 to act on", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Note" })).toBeInTheDocument();
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "Open order" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
  });
  it("reaches Call as an icon link and WhatsApp under More actions, named with the customer and number", async () => {
    render(<NextOrderCard {...base({ row: order({ reason: "flagged" }) })} />);
    expect(screen.getByRole("link", { name: /^Call Asha Rao, / })).toHaveAttribute("href", "tel:4165550123");
    openMenu();
    expect(await screen.findByRole("menuitem", { name: /^WhatsApp Asha Rao, / })).toHaveAttribute("href", "https://wa.me/4165550123");
  });
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
  it("runs the verify action", async () => {
    const { verifyPaymentAction } = await import("../../payments/actions");
    vi.mocked(verifyPaymentAction).mockResolvedValue({ ok: true } as never);
    render(<NextOrderCard {...base({ row: order({ reason: "verify", paymentPublicId: "pay_1", amount: 42 }) })} />);
    fireEvent.click(screen.getByRole("button", { name: /Verify payment/ }));
    await waitFor(() => expect(verifyPaymentAction).toHaveBeenCalledWith("ord_1", "pay_1"));
  });
  it.each(["missed", "flagged"] as const)("gives a %s order with a payment no payment action", (reason) => {
    render(<NextOrderCard {...base({ row: order({ reason, paymentPublicId: "pay_9", amount: 42 }) })} />);
    expect(screen.queryByRole("button", { name: /Verify payment|Send payment link/ })).not.toBeInTheDocument();
  });
  it("shows the empty state with a link to Waiting on payment", () => {
    render(<NextOrderCard {...base({ row: null, queueCount: 0 })} />);
    expect(screen.getByText("No orders need attention.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Waiting on payment/ })).toHaveAttribute("href", "/dashboard/orders?view=payment");
  });
  it("shows the order and the next ones as rows, at most three", () => {
    const up = Array.from({ length: 4 }, (_, i) => order({ publicId: `ord_${i + 2}`, customerName: `Customer ${i}`, reason: "pending", paymentPublicId: `pay_${i}`, amount: 10 }));
    render(<NextOrderCard {...base({ upNext: up })} />);
    const links = screen.getAllByRole("link", { name: /^(Asha Rao|Customer \d)$/ });
    expect(links).toHaveLength(3);
    expect(links[1]).toHaveAttribute("href", "/dashboard/orders/ord_2");
  });
});

describe("Cancel order on the Next order card", () => {
  it("offers Cancel only while the order can be cancelled, and calls cancel after confirming", async () => {
    const { cancel } = await import("../[id]/actions");
    const { unmount } = render(<NextOrderCard {...base({ row: order({ reason: "missed" }) })} />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cancel order" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("ord_1"));
    unmount();
    render(<NextOrderCard {...base({ row: order({ reason: "missed", status: "cancelled" }) })} />);
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "Open order" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Cancel order" })).not.toBeInTheDocument();
  });
});
