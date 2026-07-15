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
  FacetFilters: ({ spec }: { spec: unknown }) => <div data-testid="facet-filters" data-spec={JSON.stringify(spec)} />,
  ListPagination: ({ page, size, total }: { page: number; size: number; total: number }) => (
    <div data-testid="list-pagination">{`${page}-${size}-${total}`}</div>
  ),
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
        ] as never}
        page={0}
        size={25}
        total={1}
      />,
    );
    expect(screen.getByText(/Signup/)).toBeInTheDocument();
    expect(screen.getByText(/\+50/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no items", () => {
    render(<WalletLog items={[]} page={0} size={25} total={0} />);
    expect(screen.getByText("No wallet activity yet")).toBeInTheDocument();
  });
});
