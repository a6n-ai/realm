// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
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

vi.mock("@/app/(customer)/me/wallet/actions", () => ({
  loadClaimPaymentContext: vi.fn(),
  claimPaymentAction: vi.fn(),
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
  it("renders Coins, Bills, and Transactions tabs and navigates on select", () => {
    render(<FinancesTabs active="coins" />);
    expect(screen.getByRole("tab", { name: "Coins" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Bills" }));
    expect(push).toHaveBeenCalledWith("/me/wallet?tab=bills");
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    expect(push).toHaveBeenCalledWith("/me/wallet?tab=transactions");
    fireEvent.click(screen.getByRole("tab", { name: "Coins" }));
    expect(push).toHaveBeenCalledWith("/me/wallet");
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
        taxLines: [],
        payments: [{ publicId: "pay_1", status: "simulated_paid", method: "simulated", amount: "120.00", note: null, providerRef: null, providerCheckedAt: null, cardBrand: null, cardLast4: null, surchargeAmount: "0.00", cardPayable: false, addonLines: null }],
      },
      {
        publicId: "ord_2",
        deploymentId: "SUB-2",
        planName: "Monthly",
        status: "completed",
        total: "200.00",
        createdAt: Date.UTC(2026, 5, 5),
        taxLines: [],
        payments: [{ publicId: "pay_2", status: "pending", method: "cash", amount: "200.00", note: null, providerRef: null, providerCheckedAt: null, cardBrand: null, cardLast4: null, surchargeAmount: "0.00", cardPayable: false, addonLines: null }],
      },
    ];
    render(<BillsList items={items} page={0} size={25} total={2} currency="CAD" />);
    expect(screen.getByText("Weekly Veg")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText(/July 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/June 2026/i)).toBeInTheDocument();
  });
});

describe("BillsList card payments", () => {
  const bill = (pays: CustomerBill["payments"]): CustomerBill => ({
    publicId: "ord_1", deploymentId: "SUB-1", planName: "Weekly Veg", status: "active", total: "120.00",
    createdAt: Date.UTC(2026, 6, 10), taxLines: [{ name: "HST", ratePct: 13, amount: 15.6 }], payments: pays,
  });
  const card = (o: Partial<CustomerBill["payments"][number]>): CustomerBill["payments"][number] => ({
    publicId: "pay_c", status: "awaiting_payment", method: "stripe", amount: "11.30", note: null, providerRef: null, providerCheckedAt: null,
    cardBrand: null, cardLast4: null, surchargeAmount: "0.00", cardPayable: true, addonLines: null, ...o,
  });

  it("offers Pay by card only for a payment that can still be paid", () => {
    render(<BillsList items={[bill([card({ cardPayable: false })])]} page={0} size={25} total={1} currency="CAD" cardAvailable />);
    expect(screen.queryByRole("link", { name: "Pay by card" })).not.toBeInTheDocument();
    cleanup();
    render(<BillsList items={[bill([card({})])]} page={0} size={25} total={1} currency="CAD" cardAvailable />);
    expect(screen.getByRole("link", { name: "Pay by card" })).toHaveAttribute("href", "/me/pay/pay_c");
  });

  it("shows an add-on link's own lines, not the order's tax lines", () => {
    render(<BillsList items={[bill([card({ addonLines: [{ label: "Raita", amount: 10 }, { label: "HST 13%", amount: 1.3 }] })])]} page={0} size={25} total={1} currency="CAD" cardAvailable />);
    expect(screen.getByText(/Raita \$10\.00 · HST 13% \$1\.30/)).toBeInTheDocument();
    expect(screen.queryByText(/\$15\.60/)).not.toBeInTheDocument();
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
