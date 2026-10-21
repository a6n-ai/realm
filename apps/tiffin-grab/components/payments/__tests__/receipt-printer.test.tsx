// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiptPrinter, steppedEase, type Receipt } from "../receipt-printer";

// motion caches the media query at first use, so drive the hook directly.
let reduced = false;
vi.mock("motion/react", async (orig) => ({
  ...(await orig<typeof import("motion/react")>()),
  useReducedMotion: () => reduced,
}));

const receipt: Receipt = {
  title: "Veg Regular plan",
  subtitle: "Regular · 4 weeks",
  lines: [
    { label: "Subtotal", amount: 20000 },
    { label: "HST", amount: 2600 },
  ],
  total: 22600,
  orderRef: "SUB-ABC123",
  paidWith: "Visa •••• 4242",
  paidAt: Date.UTC(2026, 9, 21, 15, 30),
};
const action = { label: "Go to my deliveries", href: "/me/deliveries" };

afterEach(() => {
  cleanup();
  reduced = false;
});

describe("ReceiptPrinter", () => {
  it("complete stage renders the whole receipt and action", () => {
    render(<ReceiptPrinter stage="complete" receipt={receipt} action={action} />);
    expect(screen.getByText("Veg Regular plan")).toBeInTheDocument();
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("$226.00")).toBeInTheDocument();
    expect(screen.getByText("SUB-ABC123")).toBeInTheDocument();
    expect(screen.getByText("Visa •••• 4242")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText(/Oct 21, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my deliveries" })).toHaveAttribute("href", "/me/deliveries");
  });

  it("renders a custom status line and secondary link", () => {
    render(
      <ReceiptPrinter
        stage="complete"
        receipt={receipt}
        status="Submitted · we'll verify your e-Transfer"
        action={action}
        secondary={{ label: "View order", href: "/me/orders/1" }}
      />,
    );
    expect(screen.getByText("Submitted · we'll verify your e-Transfer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View order" })).toHaveAttribute("href", "/me/orders/1");
  });

  it("processing shows the waiting body without paper", () => {
    render(<ReceiptPrinter stage="processing" receipt={receipt} action={action} />);
    expect(screen.getByText("Processing your order")).toBeInTheDocument();
    expect(screen.queryByText("Total paid")).toBeNull();
  });

  it("printing hides the action until the feed ends", () => {
    render(<ReceiptPrinter stage="printing" receipt={receipt} action={action} />);
    expect(screen.queryByRole("link", { name: "Go to my deliveries" })).toBeNull();
  });

  it("reduced motion shows the receipt fully printed and calls onPrinted", async () => {
    reduced = true;
    const onPrinted = vi.fn();
    render(<ReceiptPrinter stage="printing" receipt={receipt} action={action} onPrinted={onPrinted} />);
    expect(screen.getByText("Total paid")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Go to my deliveries" })).toBeInTheDocument();
    expect(onPrinted).toHaveBeenCalledTimes(1);
  });

  it("the feed moves in whole rows, not a smooth slide", () => {
    const ease = steppedEase(4);
    expect([0, 0.1, 0.24, 0.26, 0.6, 0.99, 1].map(ease)).toEqual([0, 0, 0, 0.25, 0.5, 0.75, 1]);
  });

  it("reduced motion under printing shows the full receipt and its action at once", () => {
    reduced = true;
    render(<ReceiptPrinter stage="printing" receipt={receipt} action={action} onPrinted={() => {}} />);
    expect(screen.getByText("$226.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my deliveries" })).toBeInTheDocument();
  });
});
