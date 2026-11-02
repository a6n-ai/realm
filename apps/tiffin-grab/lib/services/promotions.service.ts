import { ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons, promotions } from "@/db/schema";
import { pickLive } from "@/lib/promotions/live";
import { SessionUpdatableService } from "./session-service";

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
    return pickLive(rows, now);
  }

  // A linked code must be a real, active, customer-facing coupon (never a rep's lane or issued code).
  async assertLinkableCoupon(code: string): Promise<string> {
    const [c] = await db
      .select({ code: coupons.code })
      .from(coupons)
      .where(and(
        sql`upper(${coupons.code}) = ${code.trim().toUpperCase()}`,
        eq(coupons.active, true),
        notInArray(coupons.kind, ["rep_daily", "rep_code"]),
      ))
      .limit(1);
    if (!c) throw new ValidationError(`Coupon ${code.trim().toUpperCase()} is not an active public coupon`);
    return c.code;
  }
}

export const promotionsService = new PromotionsService(
  new UpdatableRepository(db, promotions, promotions.publicId, promotions.id),
);
