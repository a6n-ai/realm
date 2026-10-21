// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("../actions", () => ({ submitCardPayment: vi.fn(), confirmReturn: vi.fn(), abandonCard: vi.fn() }));

import { PayForm } from "../pay-form";

afterEach(cleanup);

const base = { paymentId: "pay_1", status: "awaiting_payment", method: "stripe", publishableKey: "pk_test", amountCents: 1000, lines: [], total: 10, isReturn: false };

describe("PayForm", () => {
  it("shows why a closed payment can't be paid instead of the card form", () => {
    render(<PayForm {...base} closed="This payment link has expired. Ask us for a new one." />);
    expect(screen.getByText(/link has expired/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Bills" })).toHaveAttribute("href", "/me/wallet?tab=bills");
    expect(screen.queryByRole("button", { name: /pay/i })).not.toBeInTheDocument();
  });
});
