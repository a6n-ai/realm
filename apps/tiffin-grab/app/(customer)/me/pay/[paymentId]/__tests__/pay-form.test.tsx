// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";

const panel = vi.hoisted(() => ({ amount: null as number | null }));
vi.mock("../actions", () => ({ submitCardPayment: vi.fn(), confirmReturn: vi.fn(), abandonCard: vi.fn() }));
vi.mock("@/components/payments/pay-panel", () => ({
  CardPayProvider: (p: { amountCents: number; children: React.ReactNode }) => {
    panel.amount = p.amountCents;
    return <>{p.children}</>;
  },
  PaidSwitch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ExpressPay: () => <div data-testid="express" />,
  CardPay: () => <div data-testid="card-pay" />,
  LastUsedCard: () => <div data-testid="last-used" />,
}));

import { PayForm } from "../pay-form";

afterEach(() => {
  cleanup();
  panel.amount = null;
});

const ctx: CardCheckoutContext = { publishableKey: "pk_test", methodLabel: "Card", savedCards: [], customerSessionClientSecret: null, prefill: { email: "", name: "", phone: null, address: { line1: "100 Queen St W", line2: "", city: "Toronto", state: "ON", postal_code: "M5H 2N2", country: "CA" } }, feeNote: null };
const base = { paymentId: "pay_1", deploymentId: "SUB-X1", planTitle: "Veg thali", planSubtitle: "Regular", status: "awaiting_payment", method: "stripe", ctx, amountCents: 1000, lines: [], total: 10, isReturn: false };

describe("PayForm", () => {
  it("renders the shared Pay pieces with the row amount when payable", () => {
    render(<PayForm {...base} amountCents={4567} />);
    expect(panel.amount).toBe(4567);
    expect(screen.getByTestId("card-pay")).toBeInTheDocument();
    expect(screen.getByTestId("express")).toBeInTheDocument();
  });

  it("shows why a closed payment can't be paid and renders no panel", () => {
    render(<PayForm {...base} closed="This payment link has expired. Ask us for a new one." />);
    expect(screen.getByText(/link has expired/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Bills" })).toHaveAttribute("href", "/me/wallet?tab=bills");
    expect(screen.queryByTestId("card-pay")).not.toBeInTheDocument();
  });
});
