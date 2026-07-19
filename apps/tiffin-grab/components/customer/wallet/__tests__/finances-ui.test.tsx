// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/me/wallet",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: ReactNode }) => <div>{children}</div>, {
    Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  }),
  LottieEmptyState: ({ title, body }: { title: string; body: string }) => (
    <div>
      <p>{title}</p>
      <p>{body}</p>
    </div>
  ),
}));

vi.mock("@/components/filters/reui-facet-filters", () => ({
  ReuiFacetFilters: () => <div data-testid="facets" />,
}));

vi.mock("@/components/providers/timezone-provider", () => ({
  useTimezone: () => "America/Toronto",
}));

import { BillsList } from "../bills-list";
import { TransactionsList } from "../transactions-list";
import { FinancesTabs } from "../finances-tabs";
import { parseFinancesTab } from "../finances-tab";
import type { CustomerBill, MoneyLedgerTx } from "@/lib/services/customer-finances.service";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}) }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("parseFinancesTab", () => {
  it("defaults to coins and accepts bills/transactions", () => {
    expect(parseFinancesTab(undefined)).toBe("coins");
    expect(parseFinancesTab("coins")).toBe("coins");
    expect(parseFinancesTab("bills")).toBe("bills");
    expect(parseFinancesTab("transactions")).toBe("transactions");
    expect(parseFinancesTab("nope")).toBe("coins");
  });
});

describe("FinancesTabs", () => {
  it("renders Coins, Bills, and Transactions tabs with hrefs", () => {
    render(<FinancesTabs active="coins" />);
    expect(screen.getByRole("tab", { name: /Coins/i })).toHaveAttribute("href", "/me/wallet");
    expect(screen.getByRole("tab", { name: /Bills/i })).toHaveAttribute("href", "/me/wallet?tab=bills");
    expect(screen.getByRole("tab", { name: /Transactions/i })).toHaveAttribute(
      "href",
      "/me/wallet?tab=transactions",
    );
  });
});

describe("BillsList empty state", () => {
  it("shows No bills yet when empty", () => {
    render(<BillsList items={[]} page={0} size={25} total={0} currency="CAD" />);
    expect(screen.getByText(/No bills yet/i)).toBeInTheDocument();
  });

  it("groups bills by month", () => {
    const items: CustomerBill[] = [
      {
        publicId: "ord_1",
        deploymentId: "SUB-1",
        planName: "Weekly Veg",
        status: "active",
        total: "120.00",
        createdAt: Date.UTC(2026, 6, 10),
        payments: [{ publicId: "pay_1", status: "simulated_paid", amount: "120.00" }],
      },
      {
        publicId: "ord_2",
        deploymentId: "SUB-2",
        planName: "Monthly",
        status: "completed",
        total: "200.00",
        createdAt: Date.UTC(2026, 5, 5),
        payments: [{ publicId: "pay_2", status: "pending", amount: "200.00" }],
      },
    ];
    render(<BillsList items={items} page={0} size={25} total={2} currency="CAD" />);
    expect(screen.getByText("Weekly Veg")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText(/July 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/June 2026/i)).toBeInTheDocument();
  });
});

describe("TransactionsList empty state", () => {
  it("shows No transactions yet when empty", () => {
    render(<TransactionsList items={[]} page={0} size={25} total={0} currency="CAD" />);
    expect(screen.getByText(/No transactions yet/i)).toBeInTheDocument();
  });

  it("renders a payment row", () => {
    const items: MoneyLedgerTx[] = [
      {
        publicId: "led_1",
        type: "payment",
        direction: "credit",
        amount: "50.00",
        memo: "Checkout",
        createdAt: Date.UTC(2026, 6, 1, 12),
        orderPublicId: "ord_1",
      },
    ];
    render(<TransactionsList items={items} page={0} size={25} total={1} currency="CAD" />);
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText(/Checkout/)).toBeInTheDocument();
  });
});
