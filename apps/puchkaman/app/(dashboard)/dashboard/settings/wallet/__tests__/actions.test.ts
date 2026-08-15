import { describe, expect, it, vi } from "vitest";

/**
 * Pure unit test: the payout gate is a decision, not a query. Stubbing the db
 * handle keeps it off the shared dev database entirely — no coin_rate or
 * event_payout residue, and no race with the live-DB wallet suites that insert
 * a coin rate of their own in `beforeEach`.
 */
const state = vi.hoisted(() => ({
  coinRateRows: [] as unknown[],
  inserted: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => 1n }));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({ from: () => ({ limit: async () => state.coinRateRows }) }),
    insert: () => ({
      values: (v: unknown) => {
        state.inserted.push(v);
        return {
          onConflictDoUpdate: async () => {},
          then: (resolve: (x: unknown) => void) => resolve(undefined),
        };
      },
    }),
  },
}));

const { savePayoutRow } = await import("../actions");

describe("payout settings", () => {
  it("refuses to enable a payout while no coin rate exists", async () => {
    state.coinRateRows = [];
    state.inserted = [];

    await expect(
      savePayoutRow({ eventType: "order_paid", enabled: true, coins: 5 }),
    ).rejects.toThrow(/coin rate/i);

    // Nothing written: the customer must never start accruing coins that
    // checkout will then reject with a raw "No coin rate for CAD".
    expect(state.inserted).toEqual([]);
  });

  it("allows the same save once a coin rate exists", async () => {
    state.coinRateRows = [{ id: 1n }];
    state.inserted = [];

    await savePayoutRow({ eventType: "order_paid", enabled: true, coins: 5 });

    expect(state.inserted).toHaveLength(1);
  });

  it("still allows disabling, and zero-coin rows, with no rate", async () => {
    state.coinRateRows = [];
    state.inserted = [];

    await savePayoutRow({ eventType: "order_paid", enabled: false, coins: 5 });
    await savePayoutRow({ eventType: "order_paid", enabled: true, coins: 0 });

    expect(state.inserted).toHaveLength(2);
  });

  // The grid used to render all nine app_event values; only order_paid has an
  // award call site, so the rest were switches that saved and never paid out.
  it("rejects an event with no award call site", async () => {
    state.coinRateRows = [{ id: 1n }];
    state.inserted = [];

    await expect(
      savePayoutRow({ eventType: "signup", enabled: true, coins: 100 }),
    ).rejects.toThrow();
    expect(state.inserted).toEqual([]);
  });
});
