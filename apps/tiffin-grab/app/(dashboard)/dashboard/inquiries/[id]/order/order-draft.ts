import { parseIsoDateUtc } from "@foundry/commons";
import type { CatalogAddon } from "@/lib/catalog/types";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import type { DropOffValue } from "@/lib/catalog/drop-off";
import type { OrderFormValues } from "../order-schema";
import type { RepCouponInfo } from "./actions";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string; trial?: boolean; servesWeekends?: boolean; allowedDays?: DayOfWeek[] | null; addons?: CatalogAddon[] }[];
  frequencies: { key: string; name: string; weekdays?: string[] | null; savePct?: number }[];
  minTiffinsPerWeek?: number;
  timezone?: string;
  /** App-settings cutoff hour: a day whose cutoff has passed can't be a start date. */
  cutoffHour?: number;
  maxTiffinsPerWeek?: number;
  durations: { weeks: number }[];
};

export function firstWeekdayOnOrAfter(iso: string): string {
  const d = parseIsoDateUtc(iso);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function dayBeforeIso(iso: string): string {
  const d = parseIsoDateUtc(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const multiDayTrialPicks = (picked: readonly string[], weekdays: readonly string[], max: number) => (max > 1 && picked.length ? picked : weekdays);

export type OrderInputCtx = {
  mealSizes: Catalog["mealSizes"];
  trialFrequencyKey?: string;
  trialPicks: readonly string[];
  contact: { fullName: string; phone: string };
  notes: string;
  addressTagId: string | null;
  dropOff: DropOffValue;
  addressPublicId: string | null;
  realPayments: boolean;
  paymentMethodId: string | null;
  couponCodes: string[];
  repInfo: RepCouponInfo | null;
  discount: number;
};

export function buildOrderInput(v: OrderFormValues, ctx: OrderInputCtx): CreateOrderInput {
  const { trialPicks, contact } = ctx;
  const trial = ctx.mealSizes.find((m) => m.id === v.mealSizeId)?.trial === true;
  return {
    planKey: v.planKey,
    selections: {
      mealSizeId: v.mealSizeId,
      // A trial rides the frequency from Trial settings.
      frequencyKey: trial ? (ctx.trialFrequencyKey ?? v.frequencyKey) : v.frequencyKey,
      eatingDays: (trial ? trialPicks : v.eatingDays) as DayOfWeek[],
      persons: v.persons,
      mealSlots: v.mealSlots,
      includeSaturday: trial ? false : v.eatingDays.includes("sat"),
      includeSunday: trial ? false : v.eatingDays.includes("sun"),
      durationWeeks: v.durationWeeks,
      startDate: v.startDate,
      addonSelections: trial ? [] : (v.addonSelections ?? []),
      ...(trial ? { trialDays: trialPicks.length } : {}),
      addressTagId: ctx.addressTagId,
      deliveryTagId: ctx.dropOff.tagId,
      deliveryStrategyIds: ctx.dropOff.strategyIds,
    },
    addressPublicId: ctx.addressPublicId ?? undefined,
    contact: {
      fullName: contact.fullName,
      phone: contact.phone,
      email: v.email,
      addressLine: v.addressLine,
      city: v.city,
      postalCode: v.postalCode,
      deliveryInstructions: ctx.notes.trim() || null,
    },
    paymentMethodId: ctx.realPayments ? ctx.paymentMethodId : null,
    couponCodes: ctx.couponCodes,
    repCoupon: ctx.repInfo?.available && ctx.discount > 0
      ? { code: ctx.repInfo.code, requestedAmount: ctx.discount }
      : undefined,
  };
}

export function missingFields(s: {
  page?: "order" | "payment";
  estimateOnly: boolean;
  mealSizeId: string;
  startDate: string;
  isTrial: boolean;
  trialStartOk: boolean;
  addressLine?: string;
  city?: string;
  postalCode?: string;
  realPayments: boolean;
  paymentMethodId: string | null;
}): string[] {
  const orderMissing = [
    !s.mealSizeId && "meal size",
    !s.estimateOnly && !s.startDate && "start date",
    !s.estimateOnly && s.isTrial && !!s.startDate && !s.trialStartOk && "a start date on a trial day",
  ];
  const paymentMissing = [
    !s.addressLine && "address",
    !s.city && "city",
    !s.postalCode && "postal code",
    s.realPayments && !s.paymentMethodId && "payment method",
  ];
  return (s.page === "order" || s.estimateOnly ? orderMissing : [...orderMissing, ...paymentMissing]).filter(Boolean) as string[];
}
