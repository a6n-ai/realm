import {
  createWalletService,
  commitRedemption,
  lockAndQuoteRedemption,
  type WalletDeps,
  type WalletTx as PackageWalletTx,
} from "@realm/wallet";
import { db } from "@/db/client";
import { coinRate, eventPayout, ledgerEntries, orders, users, walletLedger } from "@/db/schema";

export type BusinessEvent = (typeof walletLedger.eventType.enumValues)[number];
export type WalletTx = PackageWalletTx<BusinessEvent>;

// A transaction handle from db.transaction — same shape as orders.service.ts's Tx.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The app's own money ledger. Kept here rather than in the package because
// ledger_entries is app-local and its columns differ between apps. Typed via
// WalletDeps so `tx` gets the package's own (untyped-schema) Tx, not the
// app's — the two PgTransaction schema generics are not assignable to each other.
const recordRedemptionDiscount: WalletDeps<BusinessEvent>["recordRedemptionDiscount"] = async (
  tx,
  { userId, orderId, amount, memo },
) =>
  void (await tx.insert(ledgerEntries).values({
    userId,
    orderId,
    direction: "debit",
    type: "discount",
    amount,
    memo,
  }));

export const walletService = createWalletService<BusinessEvent>({
  db,
  tables: { walletLedger, eventPayout, coinRate },
  orders,
  users,
  recordRedemptionDiscount,
});

// App-bound wrappers around the package's transaction-aware redemption
// primitives — callers already inside a tx (createOrder) don't need to know
// about walletLedger/orders/recordRedemptionDiscount wiring.
export async function lockAndQuoteCoinRedemption(
  tx: Tx,
  args: { userId: bigint; coins: number; rate: number; cap: number },
): Promise<{ coinsSpent: number; currencyValue: number }> {
  return lockAndQuoteRedemption(tx, { ...args, walletLedger, users });
}

export async function commitCoinRedemption(
  tx: Tx,
  args: { userId: bigint; coins: number; currencyValue: number; orderId: bigint; memo?: string },
): Promise<void> {
  await commitRedemption(tx, { ...args, walletLedger, orders, users, recordRedemptionDiscount });
}
