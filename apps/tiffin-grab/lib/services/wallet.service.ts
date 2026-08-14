import { createWalletService, type WalletTx as PackageWalletTx } from "@realm/wallet";
import { db } from "@/db/client";
import { coinRate, eventPayout, ledgerEntries, orders, users, walletLedger } from "@/db/schema";

export type BusinessEvent = (typeof walletLedger.eventType.enumValues)[number];
export type WalletTx = PackageWalletTx<BusinessEvent>;

export const walletService = createWalletService<BusinessEvent>({
  db,
  tables: { walletLedger, eventPayout, coinRate },
  orders,
  users,
  // The app's own money ledger. Kept here rather than in the package because
  // ledger_entries is app-local and its columns differ between apps.
  recordRedemptionDiscount: async (tx, { userId, orderId, amount, memo }) =>
    void (await tx.insert(ledgerEntries).values({
      userId,
      orderId,
      direction: "debit",
      type: "discount",
      amount,
      memo,
    })),
});
