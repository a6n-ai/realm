import { gt, lte } from "drizzle-orm";
import { deliveries } from "@/db/schema";

/** SQL twin of isCutoffPassed. */
export const cutoffPassedSql = (now: number) => lte(deliveries.cutoffAt, now);
/** Negation of cutoffPassedSql: the day can still change. */
export const cutoffOpenSql = (now: number) => gt(deliveries.cutoffAt, now);
