"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ValidationError } from "@tiffin/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { couponKind, type CouponConfig, type DiscountPolicy } from "@/db/schema/coupons";
import { planType } from "@/db/schema/catalog";
import { couponsService } from "@/lib/services/coupons.service";
import { getDiscountPolicy, setDiscountPolicy } from "@/lib/services/app-settings.service";

const PATH = "/dashboard/settings/discounts";

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

  const values = {
    code: data.code,
    kind: data.kind,
    name: data.name,
    description: data.description ?? null,
    valuePct: money(data.valuePct),
    valueAmount: money(data.valueAmount),
    minSubtotal: money(data.minSubtotal),
    maxRedemptions: data.maxRedemptions ?? null,
    maxPerUser: data.maxPerUser ?? null,
    stackable: data.stackable,
    planTypes: data.planTypes,
    startsAt: data.startsAt ?? null,
    expiresAt: data.expiresAt ?? null,
    active: data.active,
    config,
  };

  if (publicId) await couponsService.update(publicId, values);
  else await couponsService.create(values);
  revalidatePath(PATH);
}

export async function setCouponActive(publicId: string, active: boolean) {
  await requireAdmin();
  await couponsService.update(publicId, { active });
  revalidatePath(PATH);
}

const policySchema = z.object({
  enabledKinds: z.array(z.enum(couponKind.enumValues)),
  repDaily: z.object({
    enabled: z.boolean(),
    defaultCapPct: z.number().min(0).max(100),
    defaultCapAmount: z.number().min(0),
    perRep: z.record(
      z.string(),
      z.object({
        capPct: z.number().min(0).max(100).optional(),
        capAmount: z.number().min(0).optional(),
        active: z.boolean(),
      }),
    ),
  }),
});

export async function saveDiscountPolicy(policy: unknown) {
  await requireAdmin();
  const data = policySchema.parse(policy) as DiscountPolicy;
  await setDiscountPolicy(data);
  revalidatePath(PATH);
}

const repCeilingSchema = z.object({
  capPct: z.number().min(0).max(100).optional(),
  capAmount: z.number().min(0).optional(),
  active: z.boolean(),
});

export async function setRepCeiling(
  repPublicId: string,
  input: { capPct?: number; capAmount?: number; active: boolean },
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

  const policy = await getDiscountPolicy();
  policy.repDaily.perRep = {
    ...policy.repDaily.perRep,
    [repPublicId]: {
      ...(parsed.capPct != null ? { capPct: parsed.capPct } : {}),
      ...(parsed.capAmount != null ? { capAmount: parsed.capAmount } : {}),
      active: parsed.active,
    },
  };
  await setDiscountPolicy(policy);
  revalidatePath(PATH);
}
