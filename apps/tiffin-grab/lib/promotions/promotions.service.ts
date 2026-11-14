import { ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons, promotions } from "@/db/schema";
import { couponStatus } from "@/lib/coupons/status";
import { pickLive } from "@/lib/promotions/live";
import { SessionUpdatableService } from "../services/session-service";

export type Promotion = typeof promotions.$inferSelect;

class PromotionsService extends SessionUpdatableService<typeof promotions> {
  // A promotion is never hard-deleted from the UI; switching it off keeps the history.
  async delete(publicId: string): Promise<number> {
    await this.update(publicId, { active: false });
    return 1;
  }

  async listAll(): Promise<Promotion[]> {
    return db.select().from(promotions).orderBy(desc(promotions.active), desc(promotions.priority), desc(promotions.updatedAt));
  }

  async listLive(now = Date.now()): Promise<Promotion[]> {
    const rows = await db
      .select()
      .from(promotions)
      .where(and(
        eq(promotions.active, true),
        sql`(${promotions.startsAt} is null or ${promotions.startsAt} <= ${now})`,
        sql`(${promotions.endsAt} is null or ${promotions.endsAt} > ${now})`,
      ));
    const live = pickLive(rows, now);
    const codes = [...new Set(live.flatMap((p) => (p.couponCode ? [p.couponCode.toUpperCase()] : [])))];
    if (codes.length === 0) return live;
    const linked = await db
      .select({ code: coupons.code, active: coupons.active, startsAt: coupons.startsAt, expiresAt: coupons.expiresAt, maxRedemptions: coupons.maxRedemptions, redemptionCount: coupons.redemptionCount })
      .from(coupons)
      .where(inArray(sql`upper(${coupons.code})`, codes));
    const redeemable = new Set(
      linked
        .filter((c) => couponStatus(c, now) === "active" && (c.maxRedemptions == null || c.redemptionCount < c.maxRedemptions))
        .map((c) => c.code.toUpperCase()),
    );
    return live.filter((p) => !p.couponCode || redeemable.has(p.couponCode.toUpperCase()));
  }

  // A linked code must be a real, active, customer-facing coupon (never a rep's lane or issued code).
  async assertLinkableCoupon(code: string, endsAt: number | null = null): Promise<string> {
    const [c] = await db
      .select({ code: coupons.code, expiresAt: coupons.expiresAt })
      .from(coupons)
      .where(and(
        sql`upper(${coupons.code}) = ${code.trim().toUpperCase()}`,
        eq(coupons.active, true),
        notInArray(coupons.kind, ["rep_daily", "rep_code"]),
      ))
      .limit(1);
    if (!c) throw new ValidationError(`Coupon ${code.trim().toUpperCase()} is not an active public coupon`);
    if (c.expiresAt != null && (endsAt == null || endsAt > c.expiresAt)) {
      throw new ValidationError(`Coupon ${c.code} expires ${new Date(c.expiresAt).toISOString().slice(0, 10)}: end the promotion by then`);
    }
    return c.code;
  }
}

export const promotionsService = new PromotionsService(
  new UpdatableRepository(db, promotions, promotions.publicId, promotions.id),
);
