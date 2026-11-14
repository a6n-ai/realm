import { sql } from "drizzle-orm";
import { ledgerEntries } from "@/db/schema";

/** Aggregate: payment credits minus refund debits. `discount` rows record the give-up, not spend. */
export const netSpendSql = sql<string>`coalesce(sum(case when ${ledgerEntries.type} = 'payment' then ${ledgerEntries.amount} else 0 end), 0) - coalesce(sum(case when ${ledgerEntries.type} = 'refund' then ${ledgerEntries.amount} else 0 end), 0)`;
