import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { coinRate, eventPayout, walletLedger } from "@/db/schema";

describe("wallet tables (from @foundry/wallet factory)", () => {
  it("names the tables exactly as the shared factory does", () => {
    expect(getTableConfig(walletLedger).name).toBe("wallet_ledger");
    expect(getTableConfig(eventPayout).name).toBe("event_payout");
    expect(getTableConfig(coinRate).name).toBe("coin_rate");
  });

  it("keeps the idempotency index that makes award safe to retry", () => {
    const idx = getTableConfig(walletLedger).indexes.find(
      (i) => i.config.name === "wallet_earn_idempotent_idx",
    );
    expect(idx).toBeDefined();
    expect(idx!.config.unique).toBe(true);
    expect(idx!.config.columns.map((c) => (c as { name: string }).name)).toEqual([
      "source_type",
      "source_id",
      "event_type",
    ]);
  });

  it("keeps event_payout.event_type unique — one payout row per event", () => {
    const cols = getTableConfig(eventPayout).columns;
    const eventType = cols.find((c) => c.name === "event_type");
    expect(eventType?.isUnique).toBe(true);
  });
});
