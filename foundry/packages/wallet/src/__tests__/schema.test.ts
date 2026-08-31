import { describe, expect, it } from "vitest";
import { bigint, getTableConfig, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { makeWalletTables } from "../schema";

const appEvent = pgEnum("app_event", ["order_paid", "signup"]);
const ledgerDirection = pgEnum("ledger_direction", ["debit", "credit"]);
const users = pgTable("users", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const orders = pgTable("orders", { id: bigint("id", { mode: "bigint" }).primaryKey() });

const tables = makeWalletTables({ users, orders, appEvent, ledgerDirection });

describe("makeWalletTables", () => {
  it("names the tables exactly as the existing schema does", () => {
    expect(getTableConfig(tables.walletLedger).name).toBe("wallet_ledger");
    expect(getTableConfig(tables.eventPayout).name).toBe("event_payout");
    expect(getTableConfig(tables.coinRate).name).toBe("coin_rate");
  });

  it("keeps the idempotency index that makes award safe to retry", () => {
    const idx = getTableConfig(tables.walletLedger).indexes.find(
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

  it("keeps both lookup indexes", () => {
    const walletIdx = getTableConfig(tables.walletLedger).indexes.map((i) => i.config.name);
    expect(walletIdx).toContain("wallet_user_created_idx");
    const rateIdx = getTableConfig(tables.coinRate).indexes.map((i) => i.config.name);
    expect(rateIdx).toContain("coin_rate_currency_created_idx");
  });

  it("keeps event_payout.event_type unique — one payout row per event", () => {
    const cols = getTableConfig(tables.eventPayout).columns;
    const eventType = cols.find((c) => c.name === "event_type");
    expect(eventType?.isUnique).toBe(true);
  });

  it("allows a null event_type on the ledger — spends carry no event", () => {
    const cols = getTableConfig(tables.walletLedger).columns;
    expect(cols.find((c) => c.name === "event_type")?.notNull).toBe(false);
    expect(cols.find((c) => c.name === "user_id")?.notNull).toBe(true);
  });
});
