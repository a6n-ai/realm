// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(
    ({ children }: { children: React.ReactNode }) => <>{children}</>,
    { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
  ),
  LottieEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/ds", () => ({
  ListPagination: ({ page, size, total }: { page: number; size: number; total: number }) => (
    <div data-testid="list-pagination">{`${page}-${size}-${total}`}</div>
  ),
}));

vi.mock("@/components/filters/reui-facet-filters", () => ({
  ReuiFacetFilters: ({ spec }: { spec: unknown }) => <div data-testid="facet-filters" data-spec={JSON.stringify(spec)} />,
}));

vi.mock("@/components/providers/timezone-provider", () => ({ useTimezone: () => "UTC" }));

import { WalletLog } from "../wallet-log";

afterEach(cleanup);

describe("WalletLog", () => {
  it("renders rows with event label and signed coins", () => {
    render(
      <WalletLog
        items={[
          {
            publicId: "w1",
            direction: "credit",
            coins: 50,
            eventType: "signup",
            sourceType: "signup",
            sourceId: "s",
            memo: null,
            createdAt: 1_700_000_000_000,
            orderPublicId: null,
          },
          {
            publicId: "w2",
            direction: "credit",
            coins: 100,
            eventType: "order_activated",
            sourceType: "order",
            sourceId: "o",
            memo: null,
            createdAt: 1_700_000_000_000,
            orderPublicId: null,
          },
          {
            publicId: "w3",
            direction: "debit",
            coins: 20,
            eventType: "wallet_redeemed",
            sourceType: "order",
            sourceId: "o",
            memo: null,
            createdAt: 1_700_000_000_000,
            orderPublicId: null,
          },
          {
            publicId: "w4",
            direction: "credit",
            coins: 50,
            eventType: null,
            sourceType: "meal_payout",
            sourceId: "m",
            memo: null,
            createdAt: 1_700_000_000_000,
            orderPublicId: null,
          }
        ] as never}
        page={0}
        size={25}
        total={4}
      />,
    );
    expect(screen.getByText(/Signup/)).toBeInTheDocument();
    expect(screen.getAllByText(/\+50/)).toHaveLength(2);
    
    expect(screen.getByText(/Order activated/)).toBeInTheDocument();
    expect(screen.getByText(/\+100/)).toBeInTheDocument();
    
    expect(screen.getByText(/Wallet redeemed/)).toBeInTheDocument();
    expect(screen.getByText(/−20/)).toBeInTheDocument();
    
    expect(screen.getByText(/Meal payout/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no items", () => {
    render(<WalletLog items={[]} page={0} size={25} total={0} />);
    expect(screen.getByText("No wallet activity yet")).toBeInTheDocument();
  });
});
