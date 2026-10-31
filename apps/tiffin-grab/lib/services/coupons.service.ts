import { randomInt } from "node:crypto";
import { ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { couponRedemptions, coupons, customerGroupMembers, orders, payments, users } from "@/db/schema";
import type { CouponConfig, CouponKind } from "@/db/schema/coupons";
import type { PricingLine } from "@/lib/pricing";
import { getDiscountPolicy } from "./app-settings.service";
import { ledgerService } from "./ledger.service";
import { repAllowanceFor } from "./rep-allowance";
import { SessionUpdatableService } from "./session-service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Coupon = typeof coupons.$inferSelect;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: string | null): number => (v == null ? 0 : Number(v));

// No 0/O or 1/I: these codes are read out over the phone.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = (length: number): string =>
  Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

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
  // The chosen payment method id. A coupon with a non-empty allowedPaymentMethods
  // list is only eligible when this is one of them; empty list = valid everywhere.
  paymentMethodId?: string | null;
}

// Auto-apply optimizer input. The customer may also type a manual code, which
// need NOT be autoApply — if eligible it competes with the auto-apply set.
export interface BestCouponsContext {
  subtotal: number;
  planType?: string;
  userId?: bigint | null;
  paymentMethodId?: string | null;
  manualCode?: string | null;
  // Several typed codes; merged with manualCode, deduped, at most MAX_MANUAL_CODES.
  manualCodes?: readonly string[] | null;
}

export const MAX_MANUAL_CODES = 5;
const GROUP_ONLY_ERROR = "This code isn't available for your account";

// The winning set: discount lines (already distributed against the running
// subtotal) plus the coupon rows + applied amount for in-tx redemption. Typed codes
// that were rejected carry their reason in manualErrors (manualError is the first),
// so the caller can surface each inline without failing the whole resolution. A
// typed code that is valid but lost to a better combination lands in notApplied.
export interface BestCouponsResult {
  lines: PricingLine[];
  redemptions: { coupon: Coupon; amount: number }[];
  manualError?: string;
  manualErrors: { code: string; error: string }[];
  notApplied: { code: string; reason: string }[];
}

// Typed codes as the resolver reads them: trimmed, uppercased, deduped, capped.
export function normalizeCodes(...lists: (readonly (string | null | undefined)[] | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const list of lists) for (const c of list ?? []) {
    const code = c?.trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out.slice(0, MAX_MANUAL_CODES);
}

// Customer-safe projection of a coupon for the browse list — no admin-only
// fields (redemptionCount, ownerUserId, istDate).
export interface AvailableCoupon {
  code: string;
  name: string;
  description: string | null;
  kind: CouponKind;
  valuePct: string | null;
  valueAmount: string | null;
  minSubtotal: string | null;
  planTypes: string[];
  allowedPaymentMethods: string[];
  autoApply: boolean;
  expiresAt: number | null;
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

export interface IssueRepCodeInput {
  ownerUserId: bigint;
  istDate: string;
  amount: number;
  // The issuer's ceilings and daily budget, resolved from the policy by the caller.
  capPct: number;
  capAmount: number;
  dailyUses: number;
  expiresAt: number;
  note?: string | null;
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
      case "rep_code": {
        // The amount was fixed at issue; the percent ceiling can only be judged against the cart.
        const pctCeiling = coupon.capPct != null ? round2((subtotal * num(coupon.capPct)) / 100) : Infinity;
        magnitude = Math.min(num(coupon.valueAmount), pctCeiling);
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
    const pubCtx: PublicCodeContext = {
      subtotal: ctx.subtotal,
      planType: ctx.planType,
      userId: ctx.userId,
      paymentMethodId: ctx.paymentMethodId,
    };

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

    // Plus the typed codes (need not be autoApply). A failure is reported per code
    // rather than thrown, so the rest still resolve. A staff code stays out of the
    // optimizer: it goes on top of whatever set wins, and only one rides an order.
    const manualErrors: { code: string; error: string }[] = [];
    const typed: Coupon[] = [];
    let staffCode: Coupon | null = null;
    for (const code of normalizeCodes([ctx.manualCode], ctx.manualCodes)) {
      try {
        const coupon = await this.loadByCode(code);
        const err = await this.publicEligibilityError(coupon, pubCtx);
        if (err) {
          manualErrors.push({ code, error: err });
        } else if (coupon.kind === "rep_code") {
          if (staffCode) manualErrors.push({ code, error: "Only one staff code per order" });
          else staffCode = coupon;
        } else {
          typed.push(coupon);
          if (!candidates.some((c) => c.coupon.id === coupon.id)) {
            candidates.push({ coupon, line: this.resolveDiscount(coupon, pubCtx) });
          }
        }
      } catch (e) {
        manualErrors.push({ code, error: e instanceof Error ? e.message : "Invalid coupon code" });
      }
    }

    // (b) Enumerate stacking-valid final sets.
    const stackables = candidates.filter((c) => c.coupon.stackable);
    const exclusives = candidates.filter((c) => !c.coupon.stackable);
    const sets: Candidate[][] = [];
    if (stackables.length) sets.push(stackables);
    for (const ex of exclusives) sets.push([ex]);

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

    // Staff codes stack on any coupon, exclusive ones included; the percent ceiling is
    // judged against what the customer still pays after them.
    if (staffCode) {
      const line = this.resolveDiscount(staffCode, { ...pubCtx, subtotal: round2(ctx.subtotal - best.discount) });
      if (line.amount > 0) {
        best.lines.push(line);
        best.redemptions.push({ coupon: staffCode, amount: line.amount });
      }
    }

    // A valid typed code the winning set left out: an exclusive one that a better set beat,
    // or a stackable one that lost to an exclusive. Say which won so the customer can choose.
    const won = best.redemptions.map((r) => r.coupon.code).filter((c) => c !== staffCode?.code);
    const notApplied = typed
      .filter((c) => !best.redemptions.some((r) => r.coupon.id === c.id))
      .map((c) => ({
        code: c.code,
        reason: won.length ? `Can't be combined with ${won.join(", ")}, which saves more` : "Gives no discount on this order",
      }));

    return { lines: best.lines, redemptions: best.redemptions, manualError: manualErrors[0]?.error, manualErrors, notApplied };
  }

  // Staff: validate the actor's OWN rep_daily coupon and clamp to the dual ceiling.
  async validateRepCoupon(code: string, ctx: RepCouponContext): Promise<PricingLine> {
    const coupon = await this.loadByCode(code);
    if (coupon.kind !== "rep_daily") throw new ValidationError("Not a rep coupon");
    if (coupon.ownerUserId == null || coupon.ownerUserId !== ctx.actorId) {
      throw new ValidationError("This coupon is not yours to apply");
    }
    this.assertWindow(coupon);
    // Per-rep daily budget: maxRedemptions is the snapshotted daily use count, shared with
    // the codes the rep issued today. The atomic guard in redeem() is authoritative under
    // concurrency; this is the clean up-front rejection once the rep has spent today's budget.
    if (coupon.maxRedemptions != null) {
      const used = coupon.istDate
        ? await this.repUsesToday(db, coupon.ownerUserId, coupon.istDate)
        : coupon.redemptionCount;
      if (used >= coupon.maxRedemptions) throw new ValidationError("You have reached today's discount limit");
    }
    return this.resolveDiscount(coupon, ctx);
  }

  // tx-aware redemption: enforce caps under the row, write the redemption row,
  // bump the count atomically, and record the discount ledger debit.
  async redeem(tx: Tx, input: RedeemInput): Promise<void> {
    const { coupon, userId, orderId, amountApplied } = input;

    // Re-checked under the tx: the preview may have run before the group changed.
    if (await this.groupAccessError(tx, coupon, userId)) throw new ValidationError(GROUP_ONLY_ERROR);

    // A rep's day budget is shared with the codes they issued, which this coupon's own count
    // can't see. Recount under the same user-row lock issueRepCode takes, so a concurrent
    // issue or apply can't both take the last use.
    if (coupon.kind === "rep_daily" && coupon.ownerUserId != null && coupon.istDate && coupon.maxRedemptions != null) {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, coupon.ownerUserId)).for("update");
      if ((await this.repUsesToday(tx, coupon.ownerUserId, coupon.istDate)) >= coupon.maxRedemptions) {
        throw new ValidationError("You have reached today's discount limit");
      }
    }

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

  // Money back means the coupon goes back: drops the order's redemptions so the
  // customer's per-user cap and the global count free up. The ledger keeps its
  // discount debit (append-only).
  async releaseForOrder(tx: Tx, orderId: bigint): Promise<void> {
    const released = await tx
      .delete(couponRedemptions)
      .where(eq(couponRedemptions.orderId, orderId))
      .returning({ couponId: couponRedemptions.couponId });
    for (const r of released) {
      await tx
        .update(coupons)
        .set({ redemptionCount: sql`greatest(${coupons.redemptionCount} - 1, 0)` })
        .where(eq(coupons.id, r.couponId));
    }
  }

  // Cron mint: idempotent via the partial unique index (one per rep per allowance day).
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

  // Discounts a rep has given on an allowance day: uses of their daily coupon plus codes they
  // issued. One count, so the two lanes share the daily budget.
  async repUsesToday(conn: Tx | typeof db, ownerUserId: bigint, istDate: string): Promise<number> {
    const [row] = await conn
      .select({
        n: sql<number>`cast(coalesce(sum(case when ${coupons.kind} = 'rep_daily' then ${coupons.redemptionCount} else 1 end), 0) as int)`,
      })
      .from(coupons)
      .where(and(eq(coupons.ownerUserId, ownerUserId), eq(coupons.istDate, istDate), inArray(coupons.kind, ["rep_daily", "rep_code"])));
    return row?.n ?? 0;
  }

  // A one-off code a staff member hands to a customer: a fixed amount within their ceiling,
  // single use, never combinable, and counted against their daily budget when issued.
  async issueRepCode(input: IssueRepCodeInput): Promise<{ code: string; usedToday: number }> {
    const amount = round2(input.amount);
    if (!(amount > 0)) throw new ValidationError("Enter a discount amount");
    if (!(input.capPct > 0) || amount > input.capAmount) {
      throw new ValidationError(`You can give up to $${input.capAmount.toFixed(2)} per discount`);
    }
    return db.transaction(async (tx) => {
      // Serialize this rep's issues, or two requests could both take the last use of the day.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, input.ownerUserId)).for("update");
      const used = await this.repUsesToday(tx, input.ownerUserId, input.istDate);
      if (used >= input.dailyUses) throw new ValidationError("You have reached today's discount limit");
      const code = `TG-${randomCode(6)}`;
      await tx.insert(coupons).values({
        code,
        kind: "rep_code",
        name: "Staff discount",
        description: input.note?.trim() || null,
        valueAmount: amount.toFixed(2),
        capPct: input.capPct.toFixed(2),
        maxRedemptions: 1,
        stackable: true,
        visible: false,
        ownerUserId: input.ownerUserId,
        istDate: input.istDate,
        expiresAt: input.expiresAt,
        config: { kind: "rep_code" },
      });
      return { code, usedToday: used + 1 };
    });
  }

  // Public accessor: createOrder validates a code, then needs the resolved row to
  // redeem inside its tx. Shares the active-coupon guard with the validators.
  async findByCode(code: string): Promise<Coupon> {
    return this.loadByCode(code);
  }

  // Sidebar accessor: the rep's OWN coupon for the given allowance day, projected to a
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
      used: await this.repUsesToday(db, ownerId, istDate),
      total: row.maxRedemptions ?? 1,
      capPct: row.capPct != null ? num(row.capPct) : null,
      capAmount: row.capAmount != null ? num(row.capAmount) : null,
    };
  }

  // Customer browse list: active, non-rep coupons currently in-window, projected
  // to customer-safe fields. With a userId, codes this customer can no longer use
  // (used up, first-order only) are left out so we never suggest a dead code.
  async listAvailable(userId?: bigint | null): Promise<AvailableCoupon[]> {
    const rows = await db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.active, true),
          eq(coupons.visible, true),
          // Staff coupons (a rep's daily lane, one-off issued codes) are never listed or bulk-applied;
          // an issued code still works when typed.
          notInArray(coupons.kind, ["rep_daily", "rep_code"]),
        ),
      );
    const live = rows.filter((c) => !this.windowError(c) && (c.maxRedemptions == null || c.redemptionCount < c.maxRedemptions));
    const grouped = await Promise.all(live.map(async (c) => ((await this.groupAccessError(db, c, userId)) ? null : c)));
    const open = grouped.filter((c) => c != null);
    const usable = userId == null
      ? open
      : (await Promise.all(open.map(async (c) => ((await this.userEligibilityError(c, userId)) ? null : c)))).filter((c) => c != null);
    return usable
      .map((c) => ({
        code: c.code,
        name: c.name,
        description: c.description,
        kind: c.kind,
        valuePct: c.valuePct,
        valueAmount: c.valueAmount,
        minSubtotal: c.minSubtotal,
        planTypes: c.planTypes,
        allowedPaymentMethods: c.allowedPaymentMethods,
        autoApply: c.autoApply,
        expiresAt: c.expiresAt,
      }));
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
    // The order's customer, never the staff actor placing it.
    if (await this.groupAccessError(db, coupon, ctx.userId)) return GROUP_ONLY_ERROR;
    if (coupon.kind === "rep_code" && !(await this.issuerStillAllowed(coupon))) return "This code is no longer valid";
    const w = this.windowError(coupon);
    if (w) return w;
    if (coupon.minSubtotal != null && ctx.subtotal < num(coupon.minSubtotal)) {
      return `Minimum spend of $${num(coupon.minSubtotal).toFixed(2)} not met`;
    }
    if (coupon.planTypes.length && (!ctx.planType || !coupon.planTypes.includes(ctx.planType))) {
      return "This coupon is not valid for the selected plan";
    }
    if (
      coupon.allowedPaymentMethods.length &&
      (!ctx.paymentMethodId || !coupon.allowedPaymentMethods.includes(ctx.paymentMethodId))
    ) {
      return "This coupon is not valid for the selected payment method";
    }
    if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
      return "This coupon has been fully redeemed";
    }
    return ctx.userId != null ? this.userEligibilityError(coupon, ctx.userId) : null;
  }

  // A group-only coupon is usable by that group's members and nobody else (no user = no).
  private async groupAccessError(
    exec: Pick<typeof db, "select">,
    coupon: Coupon,
    userId: bigint | null | undefined,
  ): Promise<boolean> {
    if (coupon.customerGroupId == null) return false;
    if (userId == null) return true;
    const [m] = await exec
      .select({ id: customerGroupMembers.id })
      .from(customerGroupMembers)
      .where(and(eq(customerGroupMembers.groupId, coupon.customerGroupId), eq(customerGroupMembers.userId, userId)))
      .limit(1);
    return !m;
  }

  // The checks that depend only on who is paying, not on the cart.
  private async userEligibilityError(coupon: Coupon, userId: bigint): Promise<string | null> {
    if (coupon.maxPerUser != null) {
      const used = await this.userRedemptionCount(db, coupon.id, userId);
      if (used >= coupon.maxPerUser) return "You have already used this coupon";
      if (used + (await this.heldByUnpaidOrders(coupon, userId)) >= coupon.maxPerUser) {
        return "You have already used this coupon on an order waiting for payment";
      }
    }
    if (coupon.kind === "first_order") {
      const [{ n }] = await db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(orders)
        .where(eq(orders.userId, userId));
      if (n > 0) return "This coupon is only valid on your first order";
    }
    return null;
  }

  // A staff code dies with its issuer's allowance: switching a rep off, or turning staff
  // discounts off, also stops the codes they already handed out.
  private async issuerStillAllowed(coupon: Coupon): Promise<boolean> {
    if (coupon.ownerUserId == null) return false;
    const [owner] = await db
      .select({ publicId: users.publicId, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, coupon.ownerUserId))
      .limit(1);
    if (!owner || owner.status !== "active" || (owner.role !== "admin" && owner.role !== "member")) return false;
    return repAllowanceFor(await getDiscountPolicy(), owner.publicId) != null;
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

  // Coupons ride on an order until its payment is verified. Once the customer says they
  // paid (pending_verification), the code is spoken for; an abandoned checkout still
  // awaiting payment doesn't hold it, so retrying that checkout keeps the code.
  private async heldByUnpaidOrders(coupon: Coupon, userId: bigint): Promise<number> {
    const [{ n }] = await db
      .select({ n: sql<number>`cast(count(distinct ${orders.id}) as int)` })
      .from(orders)
      .innerJoin(payments, eq(payments.orderId, orders.id))
      .where(and(
        eq(orders.userId, userId),
        ne(orders.status, "cancelled"),
        eq(payments.status, "pending_verification"),
        sql`${orders.pricingSnapshot}->'pendingRedemptions' @> ${JSON.stringify([{ couponPublicId: coupon.publicId }])}::jsonb`,
      ));
    return n;
  }
}

function couponMode(config: CouponConfig | null): "percentage" | "fixed" {
  return config?.kind === "first_order" ? config.mode : "fixed";
}

export const couponsService = new CouponsService(
  new UpdatableRepository(db, coupons, coupons.publicId, coupons.id),
);
