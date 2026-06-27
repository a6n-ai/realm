import { ValidationError } from "@tiffin/commons";
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orders } from "@/db/schema";
import type { CouponConfig } from "@/db/schema/coupons";
import type { PricingLine } from "@/lib/pricing";
import { ledgerService } from "./ledger.service";
import { SessionUpdatableService } from "./session-service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Coupon = typeof coupons.$inferSelect;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: string | null): number => (v == null ? 0 : Number(v));

export interface ResolveContext {
  subtotal: number;
  planType?: string;
  userId?: bigint | null;
  requestedAmount?: number;
  actorId?: bigint | null;
}

export interface PublicCodeContext {
  subtotal: number;
  planType?: string;
  userId?: bigint | null;
}

export interface RepCouponContext {
  subtotal: number;
  requestedAmount: number;
  actorId: bigint;
  planType?: string;
  userId?: bigint | null;
}

export interface RedeemInput {
  coupon: Coupon;
  userId: bigint;
  orderId: bigint;
  redeemedBy?: bigint | null;
  amountApplied: number;
  context?: Record<string, unknown> | null;
}

export interface MintRepDailyInput {
  ownerUserId: bigint;
  istDate: string;
  capPct: number;
  capAmount: number;
  expiresAt: number;
}

class CouponsService extends SessionUpdatableService<typeof coupons> {
  // Soft-delete: a coupon is never hard-deleted (redemptions reference it).
  async delete(publicId: string): Promise<number> {
    await this.update(publicId, { active: false });
    return 1;
  }

  // Pure resolution: maps (kind, value/cap fields, ctx) → discount magnitude as a
  // positive PricingLine, clamped to subtotal and floored at 0. No DB access.
  resolveDiscount(coupon: Coupon, ctx: ResolveContext): PricingLine {
    const { subtotal } = ctx;
    let magnitude = 0;
    switch (coupon.kind) {
      case "percentage":
        magnitude = round2((subtotal * num(coupon.valuePct)) / 100);
        break;
      case "fixed":
        magnitude = Math.min(num(coupon.valueAmount), subtotal);
        break;
      case "first_order": {
        const mode = couponMode(coupon.config);
        magnitude = mode === "percentage"
          ? round2((subtotal * num(coupon.valuePct)) / 100)
          : Math.min(num(coupon.valueAmount), subtotal);
        break;
      }
      case "free_delivery":
        // Placeholder: resolves to $0 until a discrete delivery line exists.
        magnitude = 0;
        break;
      case "rep_daily": {
        const ceilings: number[] = [];
        if (ctx.requestedAmount != null) ceilings.push(ctx.requestedAmount);
        if (coupon.capPct != null) ceilings.push(round2((subtotal * num(coupon.capPct)) / 100));
        if (coupon.capAmount != null) ceilings.push(num(coupon.capAmount));
        magnitude = ceilings.length ? Math.min(...ceilings) : 0;
        break;
      }
    }
    const amount = Math.max(0, Math.min(round2(magnitude), subtotal));
    return { label: `${coupon.name} (${coupon.code})`, amount };
  }

  // Customer self-serve: validate a public code, then resolve. Rejects rep_daily.
  async validatePublicCode(code: string, ctx: PublicCodeContext): Promise<PricingLine> {
    const coupon = await this.loadByCode(code);
    if (coupon.kind === "rep_daily") throw new ValidationError("This code cannot be used here");
    this.assertWindow(coupon);

    if (coupon.minSubtotal != null && ctx.subtotal < num(coupon.minSubtotal)) {
      throw new ValidationError(`Minimum spend of $${num(coupon.minSubtotal).toFixed(2)} not met`);
    }
    if (coupon.planTypes.length && (!ctx.planType || !coupon.planTypes.includes(ctx.planType))) {
      throw new ValidationError("This coupon is not valid for the selected plan");
    }
    if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
      throw new ValidationError("This coupon has been fully redeemed");
    }
    if (ctx.userId != null && coupon.maxPerUser != null) {
      const used = await this.userRedemptionCount(db, coupon.id, ctx.userId);
      if (used >= coupon.maxPerUser) throw new ValidationError("You have already used this coupon");
    }
    if (coupon.kind === "first_order" && ctx.userId != null) {
      const [{ n }] = await db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(orders)
        .where(eq(orders.userId, ctx.userId));
      if (n > 0) throw new ValidationError("This coupon is only valid on your first order");
    }
    return this.resolveDiscount(coupon, ctx);
  }

  // Staff: validate the actor's OWN rep_daily coupon and clamp to the dual ceiling.
  async validateRepCoupon(code: string, ctx: RepCouponContext): Promise<PricingLine> {
    const coupon = await this.loadByCode(code);
    if (coupon.kind !== "rep_daily") throw new ValidationError("Not a rep coupon");
    if (coupon.ownerUserId == null || coupon.ownerUserId !== ctx.actorId) {
      throw new ValidationError("This coupon is not yours to apply");
    }
    this.assertWindow(coupon);
    if (coupon.redemptionCount !== 0) throw new ValidationError("This coupon has already been used today");
    return this.resolveDiscount(coupon, ctx);
  }

  // tx-aware redemption: enforce caps under the row, write the redemption row,
  // bump the count atomically, and record the discount ledger debit.
  async redeem(tx: Tx, input: RedeemInput): Promise<void> {
    const { coupon, userId, orderId, amountApplied } = input;

    if (coupon.maxPerUser != null) {
      const used = await this.userRedemptionCount(tx, coupon.id, userId);
      if (used >= coupon.maxPerUser) throw new ValidationError("Per-user redemption limit reached");
    }

    // Atomic global-cap guard: bump only while under the cap; no row → cap hit.
    const conds = [eq(coupons.id, coupon.id)];
    if (coupon.maxRedemptions != null) {
      conds.push(sql`${coupons.redemptionCount} < ${coupons.maxRedemptions}`);
    }
    const bumped = await tx
      .update(coupons)
      .set({ redemptionCount: sql`${coupons.redemptionCount} + 1` })
      .where(and(...conds))
      .returning({ id: coupons.id });
    if (bumped.length === 0) throw new ValidationError("Coupon redemption limit reached");

    await tx.insert(couponRedemptions).values({
      couponId: coupon.id,
      userId,
      orderId,
      redeemedBy: input.redeemedBy ?? null,
      amountApplied: amountApplied.toFixed(2),
      context: input.context ?? null,
    });

    await ledgerService.record(tx, {
      userId,
      orderId,
      direction: "debit",
      type: "discount",
      amount: amountApplied,
      memo: `Coupon ${coupon.code}`,
    });
  }

  // Cron mint: idempotent via the partial unique index (one per rep per IST day).
  async mintRepDaily(tx: Tx, input: MintRepDailyInput): Promise<void> {
    await tx
      .insert(coupons)
      .values({
        code: `REP-${input.istDate}-${input.ownerUserId}`,
        kind: "rep_daily",
        name: `Rep daily ${input.istDate}`,
        capPct: input.capPct.toFixed(2),
        capAmount: input.capAmount.toFixed(2),
        maxRedemptions: 1,
        maxPerUser: 1,
        ownerUserId: input.ownerUserId,
        istDate: input.istDate,
        expiresAt: input.expiresAt,
        active: true,
        config: { kind: "rep_daily" },
      })
      .onConflictDoNothing();
  }

  private async loadByCode(code: string): Promise<Coupon> {
    const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    if (!coupon || !coupon.active) throw new ValidationError("Invalid coupon code");
    return coupon;
  }

  private assertWindow(coupon: Coupon): void {
    const now = Date.now();
    if (coupon.startsAt != null && now < coupon.startsAt) throw new ValidationError("This coupon is not active yet");
    if (coupon.expiresAt != null && now > coupon.expiresAt) throw new ValidationError("This coupon has expired");
  }

  private async userRedemptionCount(conn: Tx | typeof db, couponId: bigint, userId: bigint): Promise<number> {
    const [{ n }] = await conn
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, couponId), eq(couponRedemptions.userId, userId)));
    return n;
  }
}

function couponMode(config: CouponConfig | null): "percentage" | "fixed" {
  return config?.kind === "first_order" ? config.mode : "fixed";
}

export const couponsService = new CouponsService(
  new UpdatableRepository(db, coupons, coupons.publicId, coupons.id),
);
