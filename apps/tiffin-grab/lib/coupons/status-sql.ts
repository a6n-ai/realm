import { and, eq, gte, isNull, lt, lte, or } from "drizzle-orm";
import { coupons } from "@/db/schema";

/** SQL twin of `couponStatus(c, now) === "active"`. */
export const couponLiveSql = (now: number) =>
  and(
    eq(coupons.active, true),
    or(isNull(coupons.startsAt), lte(coupons.startsAt, now)),
    or(isNull(coupons.expiresAt), gte(coupons.expiresAt, now)),
  );

/** SQL twin of `couponStatus(c, now) === "expired"`. */
export const couponExpiredSql = (now: number) => and(eq(coupons.active, true), lt(coupons.expiresAt, now));
