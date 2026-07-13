// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import type { WalletTx } from "@/lib/services/wallet.service";
import { WalletSection } from "../wallet-section";

// jsdom has no network stack, and the Lottie primitive (now used by the empty
// state) fetches its JSON on mount — stub it so the relative "/lottie/*.json"
// URL doesn't throw an unhandled rejection.
const fakeAnimationData = { v: "5.5.7", fr: 30, layers: [] };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => fakeAnimationData }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function tx(overrides: Partial<WalletTx>): WalletTx {
  return {
    publicId: "wtx_1",
    direction: "credit",
    coins: 10,
    eventType: "order_activated",
    sourceType: "order",
    sourceId: "1",
    memo: null,
    createdAt: Date.UTC(2026, 0, 15, 12, 0, 0),
    orderPublicId: null,
    ...overrides,
  };
}

describe("WalletSection", () => {
  it("renders the balance and one credit + one debit row with human labels", () => {
    const transactions: WalletTx[] = [
      tx({ publicId: "wtx_1", direction: "credit", coins: 15, eventType: "order_activated" }),
      tx({ publicId: "wtx_2", direction: "debit", coins: 5, eventType: null, sourceType: "redemption" }),
    ];
    render(
      <TimezoneProvider tz="America/New_York">
        <WalletSection balance={120} transactions={transactions} />
      </TimezoneProvider>,
    );

    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("+15")).toBeInTheDocument();
    expect(screen.getByText("−5")).toBeInTheDocument();
    expect(screen.getByText("Order activated")).toBeInTheDocument();
  });

  it("renders an EmptyState when there are no transactions", () => {
    render(
      <TimezoneProvider tz="America/New_York">
        <WalletSection balance={0} transactions={[]} />
      </TimezoneProvider>,
    );
    expect(screen.getByText(/no wallet activity/i)).toBeInTheDocument();
  });
});
