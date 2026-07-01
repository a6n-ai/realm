"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ValidationError } from "@tiffin/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coupons, users } from "@/db/schema";
import { couponKind, type CouponConfig, type DiscountPolicy } from "@/db/schema/coupons";
import { planType } from "@/db/schema/catalog";
import { couponsService } from "@/lib/services/coupons.service";
import { getDiscountPolicy, setDiscountPolicy } from "@/lib/services/app-settings.service";

const PATH = "/dashboard/discounts";

// Numeric columns are dollar strings; null clears the column.
const money = (n: number | null | undefined): string | null => (n == null ? null : n.toFixed(2));

const couponSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(64),
  kind: z.enum(couponKind.enumValues),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).nullish(),
  valuePct: z.number().min(0).max(100).nullish(),
  valueAmount: z.number().min(0).nullish(),
  mode: z.enum(["percentage", "fixed"]).optional(),
  minSubtotal: z.number().min(0).nullish(),
  maxRedemptions: z.number().int().min(1).nullish(),
  maxPerUser: z.number().int().min(1).nullish(),
  stackable: z.boolean(),
  autoApply: z.boolean(),
  planTypes: z.array(z.enum(planType.enumValues)).default([]),
  startsAt: z.number().int().nullish(),
  expiresAt: z.number().int().nullish(),
  active: z.boolean(),
});

export async function saveCoupon(publicId: string | null, patch: unknown) {
  await requireAdmin();
  const data = couponSchema.parse(patch);

  // rep_daily coupons are minted by the scheduler with snapshotted ceilings —
  // they are never hand-created or hand-edited from this admin surface.
  if (data.kind === "rep_daily") {
    throw new ValidationError("Rep daily coupons are minted automatically and cannot be created here");
  }

  // Creation-time gating: a kind disabled in the policy may not be created or edited
  // from this surface (honor-time enforcement at checkout is a later WF).
  const policy = await getDiscountPolicy();
  if (!policy.enabledKinds.includes(data.kind)) {
    throw new ValidationError(`The ${data.kind} coupon kind is currently disabled`);
  }

  if (data.startsAt != null && data.expiresAt != null && data.expiresAt <= data.startsAt) {
    throw new ValidationError("Expiry must be after the start date");
  }
  if (data.kind === "percentage" && data.valuePct == null) {
    throw new ValidationError("Percentage coupons need a percentage value");
  }
  if (data.kind === "fixed" && data.valueAmount == null) {
    throw new ValidationError("Fixed coupons need an amount");
  }
  if (data.kind === "first_order") {
    const mode = data.mode ?? "fixed";
    if (mode === "percentage" && data.valuePct == null) throw new ValidationError("Set the percentage value");
    if (mode === "fixed" && data.valueAmount == null) throw new ValidationError("Set the amount value");
  }

  const config: CouponConfig =
    data.kind === "first_order" ? { kind: "first_order", mode: data.mode ?? "fixed" } : { kind: data.kind };

  // Persist only the value column that the resolved kind/mode actually reads; clear
  // the other so a kind switch on edit cannot leave a stale, misleading value behind.
  const usesPct = data.kind === "percentage" || (data.kind === "first_order" && (data.mode ?? "fixed") === "percentage");
  const usesAmount = data.kind === "fixed" || (data.kind === "first_order" && (data.mode ?? "fixed") === "fixed");

  const values = {
    code: data.code,
    kind: data.kind,
    name: data.name,
    description: data.description ?? null,
    valuePct: usesPct ? money(data.valuePct) : null,
    valueAmount: usesAmount ? money(data.valueAmount) : null,
    minSubtotal: money(data.minSubtotal),
    maxRedemptions: data.maxRedemptions ?? null,
    maxPerUser: data.maxPerUser ?? null,
    stackable: data.stackable,
    autoApply: data.autoApply,
    planTypes: data.planTypes,
    startsAt: data.startsAt ?? null,
    expiresAt: data.expiresAt ?? null,
    active: data.active,
    config,
  };

  if (publicId) await couponsService.update(publicId, values);
  else await couponsService.create(values);
  revalidatePath(PATH, "layout");
}

export async function setCouponActive(publicId: string, active: boolean) {
  await requireAdmin();
  // Defense-in-depth: this server action is independently invokable, so reject
  // toggling rep_daily coupons here too (consistent with saveCoupon's guard).
  const [row] = await db
    .select({ kind: coupons.kind })
    .from(coupons)
    .where(eq(coupons.publicId, publicId))
    .limit(1);
  if (!row) throw new ValidationError("Unknown coupon");
  if (row.kind === "rep_daily") {
    throw new ValidationError("Rep daily coupons are managed automatically and cannot be toggled here");
  }
  await couponsService.update(publicId, { active });
  revalidatePath(PATH, "layout");
}

const policySchema = z.object({
  enabledKinds: z.array(z.enum(couponKind.enumValues)),
  repDaily: z.object({
    enabled: z.boolean(),
    defaultCapPct: z.number().min(0).max(100),
    defaultCapAmount: z.number().min(0),
    defaultDailyUses: z.number().int().min(1).max(99),
    perRep: z.record(
      z.string(),
      z.object({
        capPct: z.number().min(0).max(100).optional(),
        capAmount: z.number().min(0).optional(),
        dailyUses: z.number().int().min(1).max(99).optional(),
        active: z.boolean(),
      }),
    ),
  }),
});

export async function saveDiscountPolicy(policy: unknown) {
  await requireAdmin();
  const data = policySchema.parse(policy) as DiscountPolicy;
  // The ceilings / enabled-kinds sections send a full policy snapshot that may carry a
  // stale perRep map. perRep is owned exclusively by setRepCeiling, so keep the server's
  // current perRep and only take enabledKinds + the global repDaily fields from the client,
  // preventing a stale snapshot from clobbering concurrent per-rep overrides.
  const current = await getDiscountPolicy();
  const merged: DiscountPolicy = {
    enabledKinds: data.enabledKinds,
    repDaily: { ...data.repDaily, perRep: current.repDaily.perRep },
  };
  await setDiscountPolicy(merged);
  revalidatePath(PATH, "layout");
}

const repCeilingSchema = z.object({
  capPct: z.number().min(0).max(100).optional(),
  capAmount: z.number().min(0).optional(),
  dailyUses: z.number().int().min(1).max(99).optional(),
  active: z.boolean(),
});

export async function setRepCeiling(
  repPublicId: string,
  input: { capPct?: number; capAmount?: number; dailyUses?: number; active: boolean },
) {
  await requireAdmin();
  const parsed = repCeilingSchema.parse(input);

  // Resolve the rep public_id to its bigint here so no internal id crosses the
  // client boundary, and reject anything that is not an actual sales rep.
  const [rep] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.publicId, repPublicId), eq(users.role, "member"), eq(users.isSystem, false)))
    .limit(1);
  if (!rep) throw new ValidationError("Unknown sales rep");

  // Build the next policy from a shallow clone — never mutate the cached object the
  // getter returns, or a concurrent read could observe the unpersisted change.
  const current = await getDiscountPolicy();
  const perRep = { ...current.repDaily.perRep };
  if (parsed.capPct == null && parsed.capAmount == null && parsed.dailyUses == null && parsed.active) {
    // Fully default (no overrides, allowed) — drop the key so "absent = use default"
    // holds rather than accumulating a redundant override entry.
    delete perRep[repPublicId];
  } else {
    perRep[repPublicId] = {
      ...(parsed.capPct != null ? { capPct: parsed.capPct } : {}),
      ...(parsed.capAmount != null ? { capAmount: parsed.capAmount } : {}),
      ...(parsed.dailyUses != null ? { dailyUses: parsed.dailyUses } : {}),
      active: parsed.active,
    };
  }
  const next: DiscountPolicy = { ...current, repDaily: { ...current.repDaily, perRep } };
  await setDiscountPolicy(next);
  revalidatePath(PATH, "layout");
}
