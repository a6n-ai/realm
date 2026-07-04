import { ValidationError } from "@realm/commons";
import { UpdatableRepository } from "@realm/database";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orders, users } from "@/db/schema";
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

// Auto-apply optimizer input. The customer may also type a manual code, which
// need NOT be autoApply — if eligible it competes with the auto-apply set.
export interface BestCouponsContext {
  subtotal: number;
  planType?: string;
  userId?: bigint | null;
  manualCode?: string | null;
  // When set, enumerate ONLY the all-stackable set and skip the per-exclusive
  // sets. createOrder passes this when a rep_daily coupon is also applied: an
  // exclusive coupon must be used alone, so it can never ride alongside the rep
  // lane. Resolving stackable-only here picks the best stackable combo that *can*
  // legally combine with the rep coupon, instead of letting an exclusive win the
  // global optimum only to be discarded by the caller.
  stackableOnly?: boolean;
}

// The winning set: discount lines (already distributed against the running
// subtotal) plus the coupon rows + applied amount for in-tx redemption. When a
// manual code was supplied but rejected, manualError carries the reason so the
// caller can surface it inline without failing the whole resolution.
export interface BestCouponsResult {
  lines: PricingLine[];
  redemptions: { coupon: Coupon; amount: number }[];
  manualError?: string;
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
  ownerPublicId: string; // usr_<nanoid>; the code suffix is derived from this, never the internal id
  istDate: string;
  capPct: number;
  capAmount: number;
  // The rep's daily use budget → snapshotted onto maxRedemptions (floored at 1).
  dailyUses: number;
  expiresAt: number;
}

// Serializable projection of a rep's coupon for the day — safe to hand to a
// client component (no bigint, no internal ids).
export interface RepCouponToday {
  code: string;
  used: number;
  total: number;
  capPct: number | null;
  capAmount: number | null;
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
    const err = await this.publicEligibilityError(coupon, ctx);
    if (err) throw new ValidationError(err);
    return this.resolveDiscount(coupon, ctx);
  }

  // The customer auto-apply optimizer: find the best valid combination of
  // autoApply coupons for this cart, optionally competing against a manual code.
  //
  // Best = maximum customer discount (lowest checkout total), respecting
  // stacking (an exclusive coupon must be used ALONE; stackable coupons may all
  // combine), per-coupon eligibility (window / plan / min-spend), global +
  // per-user usage caps, and the $0 floor. rep_daily coupons are excluded here —
  // that staff lane lives in validateRepCoupon.
  //
  // ponytail: brute-force subset search, assumes a handful of active auto-apply
  // coupons; revisit with a greedy/DP if the catalog grows. Because discounts are
  // non-negative, the maximal "all stackable" set dominates any stackable subset,
  // so the candidate final sets are: {all stackable} and each {exclusive} alone.
  async resolveBestCoupons(ctx: BestCouponsContext): Promise<BestCouponsResult> {
    const pubCtx: PublicCodeContext = { subtotal: ctx.subtotal, planType: ctx.planType, userId: ctx.userId };

    // (a) Gather auto-apply candidates that pass eligibility for this cart.
    const autoRows = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.active, true), eq(coupons.autoApply, true), ne(coupons.kind, "rep_daily")));

    type Candidate = { coupon: Coupon; line: PricingLine };
    const candidates: Candidate[] = [];
    for (const coupon of autoRows) {
      const err = await this.publicEligibilityError(coupon, pubCtx);
      if (err) continue;
      candidates.push({ coupon, line: this.resolveDiscount(coupon, pubCtx) });
    }

    // Plus the manual code (need not be autoApply). A failure is reported via
    // manualError rather than thrown, so the auto set still resolves.
    let manualError: string | undefined;
    const manualCode = ctx.manualCode?.trim();
    if (manualCode) {
      try {
        const coupon = await this.loadByCode(manualCode);
        const err = await this.publicEligibilityError(coupon, pubCtx);
        if (err) {
          manualError = err;
        } else if (!candidates.some((c) => c.coupon.id === coupon.id)) {
          candidates.push({ coupon, line: this.resolveDiscount(coupon, pubCtx) });
        }
      } catch (e) {
        manualError = e instanceof Error ? e.message : "Invalid coupon code";
      }
    }

    // (b) Enumerate stacking-valid final sets. When stackableOnly is set (rep lane
    // present) the per-exclusive sets are skipped entirely, since an exclusive
    // coupon could never legally combine with the rep coupon anyway.
    const stackables = candidates.filter((c) => c.coupon.stackable);
    const exclusives = candidates.filter((c) => !c.coupon.stackable);
    const sets: Candidate[][] = [];
    if (stackables.length) sets.push(stackables);
    if (!ctx.stackableOnly) for (const ex of exclusives) sets.push([ex]);

    // (c) Distribute each set against the running remaining subtotal and pick the
    // set with the largest total discount (lowest customer total). The empty set
    // (no discount) is the implicit baseline when no set beats it.
    let best: { lines: PricingLine[]; redemptions: { coupon: Coupon; amount: number }[]; discount: number } = {
      lines: [],
      redemptions: [],
      discount: 0,
    };
    for (const set of sets) {
      let remaining = ctx.subtotal;
      const lines: PricingLine[] = [];
      const redemptions: { coupon: Coupon; amount: number }[] = [];
      for (const { coupon, line } of set) {
        const amount = Math.min(line.amount, remaining);
        // Skip zero-benefit coupons (free_delivery placeholders, or trailing
        // coupons clamped to 0 once earlier ones exhausted the subtotal): selecting
        // them gives the customer nothing yet would burn a redemption + maxPerUser
        // allowance and emit a $0 ledger debit.
        if (amount <= 0) continue;
        lines.push({ ...line, amount });
        redemptions.push({ coupon, amount });
        remaining = round2(remaining - amount);
      }
      const discount = round2(ctx.subtotal - remaining);
      if (discount > best.discount) best = { lines, redemptions, discount };
    }

    return { lines: best.lines, redemptions: best.redemptions, manualError };
  }

  // Staff: validate the actor's OWN rep_daily coupon and clamp to the dual ceiling.
  async validateRepCoupon(code: string, ctx: RepCouponContext): Promise<PricingLine> {
    const coupon = await this.loadByCode(code);
    if (coupon.kind !== "rep_daily") throw new ValidationError("Not a rep coupon");
    if (coupon.ownerUserId == null || coupon.ownerUserId !== ctx.actorId) {
      throw new ValidationError("This coupon is not yours to apply");
    }
    this.assertWindow(coupon);
    // Per-rep daily budget: maxRedemptions is the snapshotted daily use count. The
    // atomic guard in redeem() is authoritative under concurrency; this is the
    // clean up-front rejection once the rep has spent today's budget.
    if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
      throw new ValidationError("You have reached today's discount limit");
    }
    return this.resolveDiscount(coupon, ctx);
  }

  // tx-aware redemption: enforce caps under the row, write the redemption row,
  // bump the count atomically, and record the discount ledger debit.
  async redeem(tx: Tx, input: RedeemInput): Promise<void> {
    const { coupon, userId, orderId, amountApplied } = input;

    // Atomic global-cap guard: bump only while under the cap; no row → cap hit.
    // The UPDATE ... RETURNING also locks the coupon row for the rest of the tx,
    // so concurrent redemptions of the same coupon serialize here — the per-user
    // count below then runs under that lock and observes prior committed rows.
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

    // Per-user cap: counted AFTER the lock above so concurrent same-user redeems
    // serialize and the loser sees the winner's committed redemption. Throwing
    // here rolls back the bump with the rest of the caller's tx.
    if (coupon.maxPerUser != null) {
      const used = await this.userRedemptionCount(tx, coupon.id, userId);
      if (used >= coupon.maxPerUser) throw new ValidationError("Per-user redemption limit reached");
    }

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
  // Returns true when a row was actually inserted, false when the rep already had
  // today's coupon (the conflict path) — lets the caller report minted vs skipped.
  async mintRepDaily(tx: Tx, input: MintRepDailyInput): Promise<boolean> {
    // Code is client-facing: derive the suffix from the public id (never the
    // internal bigint). Idempotency is guaranteed by the partial unique index.
    const suffix = input.ownerPublicId.split("_").at(-1) ?? input.ownerPublicId;
    const inserted = await tx
      .insert(coupons)
      .values({
        code: `REP-${input.istDate}-${suffix}`,
        kind: "rep_daily",
        name: `Rep daily ${input.istDate}`,
        capPct: input.capPct.toFixed(2),
        capAmount: input.capAmount.toFixed(2),
        // The daily use budget (≥1) is snapshotted here; redeem()'s conditional
        // UPDATE then enforces it atomically. maxPerUser stays 1 so a rep cannot
        // stack their coupon twice onto a single customer.
        maxRedemptions: Math.max(1, Math.trunc(input.dailyUses)),
        maxPerUser: 1,
        ownerUserId: input.ownerUserId,
        istDate: input.istDate,
        expiresAt: input.expiresAt,
        active: true,
        config: { kind: "rep_daily" },
      })
      .onConflictDoNothing()
      .returning({ id: coupons.id });
    return inserted.length > 0;
  }

  // Public accessor: createOrder validates a code, then needs the resolved row to
  // redeem inside its tx. Shares the active-coupon guard with the validators.
  async findByCode(code: string): Promise<Coupon> {
    return this.loadByCode(code);
  }

  // Sidebar accessor: the rep's OWN coupon for the given IST day, projected to a
  // serializable shape (used/total budget + ceilings). Accepts the owner's public
  // id (resolved to the internal bigint here) or the bigint directly. Returns null
  // when the rep has no coupon today (allowance off / not minted yet / not a rep).
  async getTodayRepCoupon(ownerPublicIdOrId: string | bigint, istDate: string): Promise<RepCouponToday | null> {
    let ownerId: bigint | null;
    if (typeof ownerPublicIdOrId === "bigint") {
      ownerId = ownerPublicIdOrId;
    } else {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, ownerPublicIdOrId)).limit(1);
      ownerId = u?.id ?? null;
    }
    if (ownerId == null) return null;

    const [row] = await db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.kind, "rep_daily"),
          eq(coupons.ownerUserId, ownerId),
          eq(coupons.istDate, istDate),
          eq(coupons.active, true),
        ),
      )
      .limit(1);
    if (!row) return null;

    return {
      code: row.code,
      used: row.redemptionCount,
      total: row.maxRedemptions ?? 1,
      capPct: row.capPct != null ? num(row.capPct) : null,
      capAmount: row.capAmount != null ? num(row.capAmount) : null,
    };
  }

  private async loadByCode(code: string): Promise<Coupon> {
    // Case-insensitive match: codes are entered/compared uppercased elsewhere
    // (checkout UI, createOrder dedup), so a customer typing 'save10' must resolve
    // the stored 'SAVE10' rather than being told the code is invalid.
    const [coupon] = await db
      .select()
      .from(coupons)
      .where(sql`upper(${coupons.code}) = ${code.trim().toUpperCase()}`)
      .limit(1);
    if (!coupon || !coupon.active) throw new ValidationError("Invalid coupon code");
    return coupon;
  }

  // Non-throwing eligibility for a customer-facing (non-rep) coupon. Returns the
  // rejection reason, or null when the coupon is valid for this cart. Shared by
  // validatePublicCode (which throws) and resolveBestCoupons (which skips).
  private async publicEligibilityError(coupon: Coupon, ctx: PublicCodeContext): Promise<string | null> {
    if (coupon.kind === "rep_daily") return "This code cannot be used here";
    const w = this.windowError(coupon);
    if (w) return w;
    if (coupon.minSubtotal != null && ctx.subtotal < num(coupon.minSubtotal)) {
      return `Minimum spend of $${num(coupon.minSubtotal).toFixed(2)} not met`;
    }
    if (coupon.planTypes.length && (!ctx.planType || !coupon.planTypes.includes(ctx.planType))) {
      return "This coupon is not valid for the selected plan";
    }
    if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
      return "This coupon has been fully redeemed";
    }
    if (ctx.userId != null && coupon.maxPerUser != null) {
      const used = await this.userRedemptionCount(db, coupon.id, ctx.userId);
      if (used >= coupon.maxPerUser) return "You have already used this coupon";
    }
    if (coupon.kind === "first_order" && ctx.userId != null) {
      const [{ n }] = await db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(orders)
        .where(eq(orders.userId, ctx.userId));
      if (n > 0) return "This coupon is only valid on your first order";
    }
    return null;
  }

  private windowError(coupon: Coupon): string | null {
    const now = Date.now();
    if (coupon.startsAt != null && now < coupon.startsAt) return "This coupon is not active yet";
    if (coupon.expiresAt != null && now > coupon.expiresAt) return "This coupon has expired";
    return null;
  }

  private assertWindow(coupon: Coupon): void {
    const w = this.windowError(coupon);
    if (w) throw new ValidationError(w);
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
