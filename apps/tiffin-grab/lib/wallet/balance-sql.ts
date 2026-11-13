import { sql } from "drizzle-orm";
import { walletLedger } from "@/db/schema";

/** One ledger row's effect on the balance: credits add, debits subtract. */
export const signedCoinsSql = sql<number>`case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end`;

/** Sum of every ledger row in the group, as an int (no expiry filter; see wallet-balances for spendable coins). */
export const walletBalanceSql = () => sql<number>`cast(coalesce(sum(${signedCoinsSql}), 0) as int)`;
