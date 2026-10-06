import { ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { findMethod } from "@foundry/payments";
import { and, count, desc, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/db/client";
import {
  couponRedemptions,
  coupons,
  DISCOUNT_SCOPES,
  discounts,
  SESSION_CATEGORIES,
  studioSessionOccurrences,
  studioSessions,
  users,
  type DiscountScope,
  type SessionCategory,
} from "@/db/schema";
import { priceBooking, type BookingQuote, type CouponRule, type DiscountRule } from "@/lib/discounts/quote";
import { getAppClock, getDiscountSettings, getPaymentConfig } from "./app-settings.service";
import { paymentsService } from "./payments.service";
import { walletService } from "./wallet.service";
import { SessionUpdatableService } from "./session-service";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DiscountRow = typeof discounts.$inferSelect;
export type CouponRow = typeof coupons.$inferSelect;

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function optionalNumber(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ValidationError("Enter a valid number.");
  return n;
}

function optionalLimit(v: unknown): number | null {
  const n = optionalNumber(v);
  if (n == null) return null;
  if (!Number.isInteger(n) || n < 1) throw new ValidationError("Usage limits must be whole numbers of 1 or more.");
  return n;
}

function optionalMs(v: unknown): number | null {
  const n = optionalNumber(v);
  return n == null ? null : Math.trunc(n);
}

/** Shared value + window rules for discounts and coupons. Returns drizzle numeric strings. */
function normalizeValue(input: Record<string, unknown>, endKey: "endsAt" | "expiresAt") {
  const name = String(input.name ?? "").trim();
  if (!name) throw new ValidationError("Give it a name.");
  const percentOff = optionalNumber(input.percentOff);
  const amountOff = optionalNumber(input.amountOff);
  if ((percentOff == null) === (amountOff == null)) throw new ValidationError("Set a percent or an amount off, not both.");
  if (percentOff != null && (percentOff <= 0 || percentOff > 100)) {
    throw new ValidationError("Percent off must be between 0 and 100.");
  }
  if (amountOff != null && amountOff <= 0) throw new ValidationError("Amount off must be more than 0.");
  const minSubtotal = optionalNumber(input.minSubtotal);
  if (minSubtotal != null && minSubtotal < 0) throw new ValidationError("Minimum must be 0 or more.");
  const startsAt = optionalMs(input.startsAt);
  const end = optionalMs(input[endKey]);
  if (startsAt != null && end != null && end <= startsAt) throw new ValidationError("The end must be after the start.");
  return {
    name,
    percentOff: percentOff == null ? null : percentOff.toFixed(2),
    amountOff: amountOff == null ? null : amountOff.toFixed(2),
    minSubtotal: minSubtotal == null ? null : minSubtotal.toFixed(2),
    startsAt,
    [endKey]: end,
  };
}

export function normalizeDiscountWrite(input: Record<string, unknown>, sessionId: bigint | null): Record<string, unknown> {
  const scope = String(input.scope ?? "all") as DiscountScope;
  if (!DISCOUNT_SCOPES.includes(scope)) throw new ValidationError("Pick what the discount applies to.");
  const rawCategory = String(input.category ?? "");
  const category = SESSION_CATEGORIES.includes(rawCategory as SessionCategory) ? (rawCategory as SessionCategory) : null;
  if (scope === "category" && !category) throw new ValidationError("Pick a category.");
  if (scope === "session" && sessionId == null) throw new ValidationError("Pick a class.");
  return {
    ...normalizeValue(input, "endsAt"),
    scope,
    category: scope === "category" ? category : null,
    sessionId: scope === "session" ? sessionId : null,
    stackable: input.stackable !== false && input.stackable !== "false",
    active: input.active !== false && input.active !== "false",
  };
}

export function normalizeCouponWrite(input: Record<string, unknown>): Record<string, unknown> {
  const code = normalizeCode(String(input.code ?? ""));
  if (!CODE_RE.test(code)) throw new ValidationError("Code must be 3-32 letters, numbers, - or _.");
  const methods = Array.isArray(input.allowedPaymentMethods)
    ? input.allowedPaymentMethods.map(String).filter(Boolean)
    : [];
  return {
    ...normalizeValue(input, "expiresAt"),
    code,
    maxRedemptions: optionalLimit(input.maxRedemptions),
    maxPerUser: optionalLimit(input.maxPerUser),
    allowedPaymentMethods: methods,
    stackable: input.stackable === true || input.stackable === "true",
    active: input.active !== false && input.active !== "false",
  };
}

const num = (v: string | null): number | null => (v == null ? null : Number(v));

function toDiscountRule(r: DiscountRow): DiscountRule {
  return {
    publicId: r.publicId,
    name: r.name,
    scope: r.scope,
    category: r.category,
    sessionId: r.sessionId,
    percentOff: num(r.percentOff),
    amountOff: num(r.amountOff),
    minSubtotal: num(r.minSubtotal),
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    stackable: r.stackable,
    active: r.active,
  };
}

function toCouponRule(r: CouponRow, userRedemptionCount: number): CouponRule {
  return {
    publicId: r.publicId,
    code: r.code,
    name: r.name,
    percentOff: num(r.percentOff),
    amountOff: num(r.amountOff),
    minSubtotal: num(r.minSubtotal),
    maxRedemptions: r.maxRedemptions,
    maxPerUser: r.maxPerUser,
    redemptionCount: r.redemptionCount,
    userRedemptionCount,
    allowedPaymentMethods: r.allowedPaymentMethods,
    startsAt: r.startsAt,
    expiresAt: r.expiresAt,
    stackable: r.stackable,
    active: r.active,
  };
}

class DiscountsService extends SessionUpdatableService<typeof discounts> {
  async resolveSessionId(sessionPublicId: string | null): Promise<bigint | null> {
    if (!sessionPublicId) return null;
    const [row] = await db
      .select({ id: studioSessions.id })
      .from(studioSessions)
      .where(eq(studioSessions.publicId, sessionPublicId))
      .limit(1);
    if (!row) throw new ValidationError("Class not found.");
    return row.id;
  }

  /** REST and form writes both land here, so validation cannot be skipped. */
  async create(values: Record<string, unknown>): Promise<DiscountRow> {
    const sessionId = await this.resolveSessionId((values.sessionPublicId as string | undefined) ?? null);
    return super.create(normalizeDiscountWrite(values, sessionId));
  }

  /** Fields the patch leaves out keep their stored value, so a partial PATCH never resets scope or flags. */
  async update(publicId: string, patch: Record<string, unknown>): Promise<DiscountRow> {
    const cur = await this.repo.findByPublicId(publicId);
    if (!cur) throw new ValidationError("Discount not found.");
    const merged = {
      name: cur.name,
      scope: cur.scope,
      category: cur.category,
      percentOff: cur.percentOff,
      amountOff: cur.amountOff,
      minSubtotal: cur.minSubtotal,
      startsAt: cur.startsAt,
      endsAt: cur.endsAt,
      stackable: cur.stackable,
      active: cur.active,
      ...patch,
    };
    const sessionId =
      "sessionPublicId" in patch
        ? await this.resolveSessionId((patch.sessionPublicId as string | null) ?? null)
        : cur.sessionId;
    return super.update(publicId, normalizeDiscountWrite(merged, sessionId));
  }

  async listAll(): Promise<Array<DiscountRow & { sessionTitle: string | null; sessionPublicId: string | null }>> {
    return db
      .select({ ...getTableColumns(discounts), sessionTitle: studioSessions.title, sessionPublicId: studioSessions.publicId })
      .from(discounts)
      .leftJoin(studioSessions, eq(studioSessions.id, discounts.sessionId))
      .orderBy(desc(discounts.createdAt));
  }

  /** Active rules (priceBooking filters by class). `lock` takes the coupon row FOR UPDATE inside a booking transaction. */
  async loadPricing(
    tx: Tx,
    input: { code: string | null; userId: bigint | null; lock: boolean },
  ): Promise<{ discounts: DiscountRule[]; coupon: CouponRule | null }> {
    const discountRows = await tx.select().from(discounts).where(eq(discounts.active, true));
    const code = input.code ? normalizeCode(input.code) : "";
    if (!code) return { discounts: discountRows.map(toDiscountRule), coupon: null };

    const q = tx.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    const [row] = input.lock ? await q.for("update") : await q;
    if (!row) return { discounts: discountRows.map(toDiscountRule), coupon: null };

    let userRedemptionCount = 0;
    if (input.userId != null) {
      const [c] = await tx
        .select({ n: count() })
        .from(couponRedemptions)
        .where(and(eq(couponRedemptions.couponId, row.id), eq(couponRedemptions.userId, input.userId)));
      userRedemptionCount = Number(c?.n ?? 0);
    }
    return { discounts: discountRows.map(toDiscountRule), coupon: toCouponRule(row, userRedemptionCount) };
  }

  /** Preview for the booking control. The booking itself re-quotes inside its transaction. */
  async quoteForOccurrence(
    occurrencePublicId: string,
    seats: number,
    code: string | null,
    userPublicId: string | null,
    useCoins = false,
  ): Promise<BookingQuote & { currency: string }> {
    const [row] = await db
      .select({ id: studioSessions.id, category: studioSessions.category, priceAmount: studioSessions.priceAmount })
      .from(studioSessionOccurrences)
      .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
      .where(eq(studioSessionOccurrences.publicId, occurrencePublicId))
      .limit(1);
    if (!row) throw new ValidationError("Session not found.");
    const [user] = userPublicId
      ? await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1)
      : [];
    const [rails, cfg, { currency }, { maxDiscountPct }] = await Promise.all([
      paymentsService.enabledRails(),
      getPaymentConfig(),
      getAppClock(),
      getDiscountSettings(),
    ]);
    // Same rule as booking: no payment rail or no price means the class is free.
    const unit = Number(row.priceAmount);
    if (!rails.length || !Number.isFinite(unit) || unit <= 0) {
      return { subtotal: 0, adjustments: [], discountTotal: 0, taxTotal: 0, total: 0, codeError: null, currency };
    }
    const method = findMethod(cfg, rails[0]!.id) ?? rails[0]!;
    // Preview only: unlocked balance. The booking re-reads it under the family's lock.
    const rate = useCoins && user ? await walletService.walletRate() : null;
    const balance = rate && user ? await walletService.balance(user.id) : 0;
    const coins = rate && balance > 0 ? { balance, rate } : null;
    const rules = await db.transaction((tx) => this.loadPricing(tx, { code, userId: user?.id ?? null, lock: false }));
    const quote = priceBooking({
      unitPrice: row.priceAmount,
      seats,
      session: { id: row.id, category: row.category },
      method,
      discounts: rules.discounts,
      coupon: rules.coupon,
      codeTyped: Boolean(code?.trim()),
      maxDiscountPct,
      now: Date.now(),
      coins,
    });
    return { ...quote, currency };
  }
}

class CouponsService extends SessionUpdatableService<typeof coupons> {
  async create(values: Record<string, unknown>): Promise<CouponRow> {
    const normalized = normalizeCouponWrite(values);
    await this.assertCodeFree(normalized.code as string, null);
    return super.create(normalized);
  }

  /** Fields the patch leaves out keep their stored value. */
  async update(publicId: string, patch: Record<string, unknown>): Promise<CouponRow> {
    const cur = await this.repo.findByPublicId(publicId);
    if (!cur) throw new ValidationError("Coupon not found.");
    const normalized = normalizeCouponWrite({
      code: cur.code,
      name: cur.name,
      percentOff: cur.percentOff,
      amountOff: cur.amountOff,
      minSubtotal: cur.minSubtotal,
      maxRedemptions: cur.maxRedemptions,
      maxPerUser: cur.maxPerUser,
      allowedPaymentMethods: cur.allowedPaymentMethods,
      startsAt: cur.startsAt,
      expiresAt: cur.expiresAt,
      stackable: cur.stackable,
      active: cur.active,
      ...patch,
    });
    await this.assertCodeFree(normalized.code as string, publicId);
    return super.update(publicId, normalized);
  }

  listAll(): Promise<CouponRow[]> {
    return db.select().from(coupons).orderBy(desc(coupons.createdAt));
  }

  private async assertCodeFree(code: string, exceptPublicId: string | null): Promise<void> {
    const [row] = await db.select({ publicId: coupons.publicId }).from(coupons).where(eq(coupons.code, code)).limit(1);
    if (row && row.publicId !== exceptPublicId) throw new ValidationError("That code is already in use.");
  }
}

export const discountsService = new DiscountsService(
  new UpdatableRepository(db, discounts, discounts.publicId, discounts.id),
);
export const couponsService = new CouponsService(new UpdatableRepository(db, coupons, coupons.publicId, coupons.id));
