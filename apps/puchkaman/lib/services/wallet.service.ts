import {
  createWalletService,
  commitRedemption,
  lockAndQuoteRedemption,
  reverseRedemption,
  type WalletDeps,
  type WalletTx as PackageWalletTx,
} from "@realm/wallet";
import { db } from "@/db/client";
import { coinRate, eventPayout, orders, users, walletLedger } from "@/db/schema";
import { ledgerService } from "./ledger.service";

export type BusinessEvent = (typeof walletLedger.eventType.enumValues)[number];
export type WalletTx = PackageWalletTx<BusinessEvent>;

// A transaction handle from db.transaction — same shape as orders.service.ts's Tx.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Puchkaman's own money ledger, routed through ledgerService.record so the
// append-only rule (ledgerService.delete throws) stays enforced in one place.
// Typed via WalletDeps so `tx` gets the package's own (untyped-schema) Tx,
// not the app's — the two PgTransaction schema generics are not assignable
// to each other.
const recordRedemptionDiscount: WalletDeps<BusinessEvent>["recordRedemptionDiscount"] = (tx, { userId, orderId, amount, memo }) =>
  ledgerService.record(tx as unknown as Tx, {
    userId,
    orderId,
    direction: "debit",
    type: "discount",
    amount,
    memo,
  });

// No wallet cap for puchkaman (unlike tiffin-grab's canAward) — that cap
// arrived with tiffin's bulk-payout feature and is not part of this slice.
export const walletService = createWalletService<BusinessEvent>({
  db,
  tables: { walletLedger, eventPayout, coinRate },
  orders,
  users,
  recordRedemptionDiscount,
});

// App-bound wrappers around the package's transaction-aware redemption
// primitives — callers already inside a tx don't need to know about
// walletLedger/orders/recordRedemptionDiscount wiring.
//
// No cap check on any of these: they spend or reverse coins, never award them.
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

export async function reverseCoinRedemption(
  tx: Tx,
  args: { userId: bigint; orderId: bigint },
): Promise<{ coinsReturned: number }> {
  return reverseRedemption(tx, { ...args, walletLedger, orders, users });
}
