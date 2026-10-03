/**
 * Launch seed: imports every WordPress customer with an active plan (processing,
 * paused or on-hold order) straight from the live WordPress MySQL database.
 *
 * Usage:
 *   WP_MYSQL_URL=mysql://user:pass@host:3306/db DATABASE_URL=... tsx db/seed-customers.ts          # dry run (default)
 *   WP_MYSQL_URL=mysql://user:pass@host:3306/db DATABASE_URL=... tsx db/seed-customers.ts --apply  # writes
 *
 * Per customer it writes the account (no credential, not verified), a default
 * address, and one `pending` order holding the WordPress remaining-tiffin balance
 * with NO deliveries, NO payment, NO coupons/coins and NO notifications: WordPress
 * keeps delivering until staff switch the customer over (invite, then "Start
 * migrated plan" on the order, which schedules the balance from a chosen date).
 *
 * Re-runnable while WordPress stays live. Orders are keyed by deploymentId
 * `wc-<wordpress order id>`: a `pending` one is refreshed with WordPress's current
 * balance and address; one staff already started is never touched again.
 */
import { and, eq, inArray, isNull, like, ne, or } from "drizzle-orm";
import mysql from "mysql2/promise";
import { emailSchema, zonedDateIso } from "@foundry/commons";
import { db } from "./client";
import { orderActivities, orders, organization, users } from "./schema";
import { invalidateCatalogSnapshot, loadCatalogSnapshot } from "../lib/catalog/load";
import { findZone } from "../lib/catalog/zone-match";
import { categoryCountsFromItems } from "../lib/menu/pick-size";
import type { DayOfWeek } from "../lib/menu/delivery-days";
import { nextTripDate, tripsFor } from "../lib/orders/bounded-deliveries";
import { matchZone, parseCanadianPostalCode } from "../lib/catalog/postal";
import { getAppSettings } from "../lib/services/app-settings.service";
import { provisionCustomerByPhone } from "../lib/services/customers.service";
import { addressService } from "../lib/services/addresses.service";
import type { OrderPricingSnapshot } from "../lib/pricing/types";
import { parseCustomMealName } from "../lib/custom-meal/parse-wp";
import { compositionName, mealPlanKey, normalizeItems, type CategoryUnit, type CustomMealItem } from "../lib/custom-meal/composition";
import { findOrCreateCustomMealSize, loadCategoryUnits } from "../lib/services/custom-meal.service";

export const MIGRATION_TAG = "Migrated from WordPress";
const WP_STATUSES = ["wc-processing", "wc-paused", "wc-on-hold"];

// ---------- WordPress read ----------

export type WpRow = {
  id: number;
  status: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  postcode: string | null;
  preferredDays: string | null;
  totalTiffins: string | null;
  veg: string | null;
  startDate: string | null;
  deliveryType: string | null;
  products: string | null;
  // Line-item "add-ons" text ("2 Rotis", "1 Veg (12oz)"): extra portions in every tiffin.
  addons?: string | null;
  qty: string | null;
  customerNote: string | null;
  history: string | null;
};

// Shipping address when present, else billing (WooCommerce fills both on most orders).
// Persons comes from the line item's _qty; wp_wc_order_product_lookup is often empty.
const WP_QUERY = `
SELECT o.id, o.status, o.billing_email AS email,
  b.first_name AS firstName, b.last_name AS lastName, b.phone AS phone,
  COALESCE(NULLIF(s.address_1,''), b.address_1) AS address1,
  COALESCE(NULLIF(s.address_2,''), b.address_2) AS address2,
  COALESCE(NULLIF(s.city,''), b.city) AS city,
  COALESCE(NULLIF(s.postcode,''), b.postcode) AS postcode,
  MAX(CASE WHEN m.meta_key='Prefered Days' THEN m.meta_value END) AS preferredDays,
  MAX(CASE WHEN m.meta_key='Number Of Tiffins' THEN m.meta_value END) AS totalTiffins,
  MAX(CASE WHEN m.meta_key='Veg / Non Veg' THEN m.meta_value END) AS veg,
  MAX(CASE WHEN m.meta_key='Start Date' THEN m.meta_value END) AS startDate,
  MAX(CASE WHEN m.meta_key='Delivery Type' THEN m.meta_value END) AS deliveryType,
  MAX(CASE WHEN m.meta_key='tiffin_count_history' THEN m.meta_value END) AS history,
  (SELECT GROUP_CONCAT(i.order_item_name SEPARATOR ' | ') FROM wp_woocommerce_order_items i
     WHERE i.order_id=o.id AND i.order_item_type='line_item') AS products,
  (SELECT GROUP_CONCAT(im.meta_value SEPARATOR ' + ') FROM wp_woocommerce_order_items i
     JOIN wp_woocommerce_order_itemmeta im ON im.order_item_id=i.order_item_id AND im.meta_key='add-ons' AND im.meta_value<>''
     WHERE i.order_id=o.id AND i.order_item_type='line_item') AS addons,
  (SELECT SUM(im.meta_value) FROM wp_woocommerce_order_items i
     JOIN wp_woocommerce_order_itemmeta im ON im.order_item_id=i.order_item_id AND im.meta_key='_qty'
     WHERE i.order_id=o.id AND i.order_item_type='line_item') AS qty,
  o.customer_note AS customerNote
FROM wp_wc_orders o
LEFT JOIN wp_wc_order_addresses b ON b.order_id=o.id AND b.address_type='billing'
LEFT JOIN wp_wc_order_addresses s ON s.order_id=o.id AND s.address_type='shipping'
LEFT JOIN wp_wc_orders_meta m ON m.order_id=o.id
  AND m.meta_key IN ('Prefered Days','Number Of Tiffins','Veg / Non Veg','Start Date','Delivery Type','tiffin_count_history')
WHERE o.type='shop_order' AND o.status IN (?)
GROUP BY o.id
ORDER BY o.id`;

async function readWordPress(): Promise<WpRow[]> {
  const url = process.env.WP_MYSQL_URL;
  if (!url) throw new Error("WP_MYSQL_URL is required (mysql://user:pass@host:3306/db)");
  const conn = await mysql.createConnection(url);
  try {
    const [rows] = await conn.query(WP_QUERY, [WP_STATUSES]);
    return (rows as WpRow[]).map((r) => ({ ...r, qty: r.qty == null ? null : String(r.qty) }));
  } finally {
    await conn.end();
  }
}

/** Remaining balance = the latest `remaining_tiffins` in the plugin's serialized
 * per-date history; no history means delivery hasn't started, so the full count. */
/** Where WordPress left off: the last day it delivered a box, and how many boxes in all.
 * The history is one serialized entry per calendar day, oldest first. */
export function wordpressPosition(history: string | null): { lastDeliveredDate: string | null; deliveredCount: number } {
  let lastDeliveredDate: string | null = null;
  let deliveredCount = 0;
  for (const m of (history ?? "").matchAll(/s:10:"(\d{4}-\d{2}-\d{2})";a:\d+:\{(.*?)\}(?=s:10:"\d{4}-|\}$)/gs)) {
    const boxes = Number(/"boxes_delivered";i:(\d+)/.exec(m[2]!)?.[1] ?? 0);
    if (boxes > 0) {
      deliveredCount += boxes;
      lastDeliveredDate = m[1]!;
    }
  }
  return { lastDeliveredDate, deliveredCount };
}

export function remainingTiffins(history: string | null, totalTiffins: string | null): number {
  const all = [...(history ?? "").matchAll(/"remaining_tiffins";i:(-?\d+);/g)];
  const last = all.at(-1)?.[1];
  const n = last != null ? Number(last) : Number(totalTiffins);
  return Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
}

// ---------- field mapping (pure) ----------

export type MigrationRecord = {
  wpOrderId: number;
  wpStatus: string;
  fullName: string;
  phone: string;
  email: string;
  addressLine: string;
  addressUnit: string | null;
  city: string;
  postalCode: string;
  deliveryInstructions: string | null;
  planKey: "veg" | "non-veg";
  productText: string;
  // WordPress line-item add-ons (extra portions per tiffin), "" when none.
  addonsText: string;
  // "mwf" for the exact Mon/Wed/Fri phrase, "5_day" for everything else (legacy
  // customers on a custom weekday pick were always delivered on the 5-day route).
  frequencyKey: "5_day" | "mwf";
  // Weekdays the customer eats, incl. sat/sun from the weekend flags.
  eatingDays: DayOfWeek[];
  includeSaturday: boolean;
  includeSunday: boolean;
  persons: number;
  tiffinCount: number;
  sourceStartDate: string;
  // Renewal orders for the same plan whose balance was added to this one.
  mergedWpOrderIds: number[];
  // WordPress position, for the next-due start date and the admin banner.
  lastDeliveredDate: string | null;
  deliveredCount: number;
};

const WEEK_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_BY_NAME: Record<string, DayOfWeek> = {
  monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu", friday: "fri", saturday: "sat", sunday: "sun",
};
const FIVE: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
const isWeekend = (d: DayOfWeek) => d === "sat" || d === "sun";

// How the legacy plugin's "Prefered Days" text reads, verified against the
// tiffin_count_history delivery logs (2026-09-29): two dash-joined days are an
// inclusive RANGE ("Monday - Friday" delivers Mon..Fri, "Monday - Wednesday"
// Mon..Wed), one day is that day, three or more are a LIST ("Monday - Wednesday
// - Friday"). WordPress never delivers on a weekend, so "Monday - Saturday" and
// "Monday - Sunday" are Mon..Fri. Everyone rides the 5-day route; the days are
// when that customer eats.
function parsePreferredDays(raw: string | null): { frequencyKey: "5_day" | "mwf"; eatingDays: DayOfWeek[]; includeSaturday: boolean; includeSunday: boolean } {
  let days = [...(raw ?? "").toLowerCase().matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)]
    .map((m) => DAY_BY_NAME[m[1]]);
  // A trailing weekend on a list ("Monday - Friday - Saturday") is a suffix, not a list item.
  if (days.length >= 3) days = days.filter((d) => !isWeekend(d));
  let picked: DayOfWeek[];
  if (days.length === 2) {
    const [from, to] = [WEEK_ORDER.indexOf(days[0]), WEEK_ORDER.indexOf(days[1])];
    picked = from <= to ? WEEK_ORDER.slice(from, to + 1) : [days[0], days[1]];
  } else {
    picked = days;
  }
  const weekdays = WEEK_ORDER.filter((d) => picked.includes(d) && !isWeekend(d));
  const eatingDays = weekdays.length ? weekdays : FIVE;
  const mwf = eatingDays.join() === "mon,wed,fri";
  return { frequencyKey: mwf ? "mwf" : "5_day", eatingDays, includeSaturday: false, includeSunday: false };
}

function planKeyFor(row: WpRow): "veg" | "non-veg" {
  const v = (row.veg ?? "").trim().toLowerCase();
  if (v === "veg") return "veg";
  if (v === "non-veg") return "non-veg";
  return /non-veg/i.test(row.products ?? "") ? "non-veg" : "veg";
}

// A handful of rows have a product name that unambiguously says one diet while
// the Veg / Non Veg meta says the other. Rather than guess which is stale, they
// are excluded and listed for manual review.
export function hasVegConflict(row: WpRow): boolean {
  const col = (row.veg ?? "").trim().toLowerCase();
  if (col !== "veg" && col !== "non-veg") return false;
  const prod = (row.products ?? "").toLowerCase();
  const prodSaysNonVeg = /non-veg|nonveg/.test(prod);
  const prodSaysVeg = /\bveg\b/.test(prod) && !prodSaysNonVeg;
  return (col === "veg" && prodSaysNonVeg) || (col === "non-veg" && prodSaysVeg);
}

// "Delivery" is the plain default; any other type (basement, house, concierge…)
// is a drop-off hint the driver needs, so it rides along with the customer's note.
function instructionsFor(row: WpRow): string | null {
  const type = (row.deliveryType ?? "").trim();
  const parts = [type && type !== "Delivery" ? type : "", (row.customerNote ?? "").trim()].filter(Boolean);
  return parts.length ? parts.join(". ") : null;
}

/** 10 NANP digits, or "" for anything else (never guesses a country code). */
function nanpDigits(raw: string | null): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return "";
}

export function mapRow(row: WpRow): MigrationRecord {
  const { frequencyKey, eatingDays, includeSaturday, includeSunday } = parsePreferredDays(row.preferredDays);
  return {
    wpOrderId: row.id,
    wpStatus: row.status,
    fullName: [row.firstName, row.lastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" "),
    phone: nanpDigits(row.phone),
    email: (row.email ?? "").trim().toLowerCase(),
    addressLine: (row.address1 ?? "").trim(),
    addressUnit: (row.address2 ?? "").trim() || null,
    city: (row.city ?? "").trim(),
    postalCode: (row.postcode ?? "").trim().toUpperCase(),
    deliveryInstructions: instructionsFor(row),
    planKey: planKeyFor(row),
    productText: (row.products ?? "").trim(),
    // WordPress sometimes stores a leading "+" ("+ 1 Roti"); normalized so a renewal still matches.
    addonsText: (row.addons ?? "").split("+").map((s) => s.trim()).filter(Boolean).join(" + "),
    frequencyKey,
    eatingDays,
    includeSaturday,
    includeSunday,
    persons: Math.max(1, Math.round(Number(row.qty) || 1)),
    tiffinCount: remainingTiffins(row.history, row.totalTiffins),
    ...wordpressPosition(row.history),
    sourceStartDate: (row.startDate ?? "").trim(),
    mergedWpOrderIds: [],
  };
}

// ---------- dedup ----------

/** One plan per customer (phone). A renewal bought before the running plan ended shows up
 * as a second active order: same product, days and persons, so its balance is added to
 * the first (the customer paid for both). A genuinely different second plan cannot ride
 * on one order: the larger balance is kept and the other is listed for staff. */
export function dedupeByPhone(records: MigrationRecord[]): { kept: MigrationRecord[]; dropped: MigrationRecord[] } {
  const byPhone = new Map<string, MigrationRecord>();
  const dropped: MigrationRecord[] = [];
  const samePlan = (a: MigrationRecord, b: MigrationRecord) =>
    a.productText === b.productText && a.addonsText === b.addonsText && a.persons === b.persons && a.eatingDays.join() === b.eatingDays.join();
  for (const r of [...records].sort((a, b) => a.wpOrderId - b.wpOrderId)) {
    const existing = byPhone.get(r.phone);
    if (!existing) {
      byPhone.set(r.phone, { ...r, mergedWpOrderIds: [] });
      continue;
    }
    if (samePlan(existing, r)) {
      existing.tiffinCount += r.tiffinCount;
      existing.mergedWpOrderIds.push(r.wpOrderId);
      continue;
    }
    const better = r.tiffinCount > existing.tiffinCount;
    dropped.push(better ? existing : r);
    if (better) byPhone.set(r.phone, { ...r, mergedWpOrderIds: [] });
  }
  return { kept: [...byPhone.values()], dropped };
}

/** A custom and a regular plan on one phone: dedupe kept one, the other needs a person. */
export function mixedKindDuplicates(kept: MigrationRecord[], dropped: MigrationRecord[]): { kept: MigrationRecord; dropped: MigrationRecord }[] {
  const byPhone = new Map(kept.map((k) => [k.phone, k]));
  return dropped.flatMap((d) => {
    const k = byPhone.get(d.phone);
    return k && isCustomMeal(k.productText) !== isCustomMeal(d.productText) ? [{ kept: k, dropped: d }] : [];
  });
}

// ---------- meal size matching ----------

type CatalogSnapshot = Awaited<ReturnType<typeof loadCatalogSnapshot>>;
type CatalogMealSize = CatalogSnapshot["mealSizes"][number];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// WordPress product names → the catalog's meal size keys (db/seed.sql):
// item{4,5}_{regular,large}_{veg,nonveg}, sabzi_only_{regular,large}_*, new_thali_*,
// maharaja_*, small_thali (veg only). Word order and "Meal"/"(Regular)" noise vary,
// so it keys off the signal words. A trial is one 5-item regular tiffin.
export function isCustomMeal(productText: string): boolean {
  return /\bcustom meal\b/.test(normalize(productText));
}

export function catalogKeyFor(productText: string, planKey: "veg" | "non-veg"): string | null {
  const t = normalize(productText);
  const diet = planKey === "veg" ? "veg" : "nonveg";
  const size = /\blarge\b/.test(t) ? "large" : "regular";
  if (/\bcustom meal\b/.test(t)) return null;
  if (/\bmaharaja\b/.test(t)) return `maharaja_${diet}`;
  if (/\bnew (plan|thali)\b/.test(t)) return `new_thali_${diet}`;
  if (/\bsabzi only\b/.test(t)) return `sabzi_only_${size}_${diet}`;
  if (/\bsmall thali\b/.test(t)) return planKey === "veg" ? "small_thali" : null;
  if (/\btrial\b/.test(t)) return `item5_regular_${diet}`;
  if (/\bitem\b/.test(t) && /\b5\b/.test(t)) return `item5_${size}_${diet}`;
  if (/\bitem\b/.test(t) && /\b4\b/.test(t)) return `item4_${size}_${diet}`;
  return null;
}

export function matchMealSize(productText: string, planKey: "veg" | "non-veg", mealSizes: CatalogMealSize[]): { mealSize: CatalogMealSize; isCustomFallback: boolean } {
  const candidates = mealSizes.filter((m) => m.planKey === planKey);

  const key = catalogKeyFor(productText, planKey);
  const byKey = key ? candidates.find((m) => m.key === key) : undefined;
  if (byKey) return { mealSize: byKey, isCustomFallback: false };

  // Free-text custom meal: tier by '+'-separated component count.
  const componentCount = productText.split("+").length;
  const tier = componentCount <= 1 ? "budget" : componentCount === 2 ? "medium" : "premium";
  const fallback = candidates.find((m) => m.tier === tier) ?? candidates[0];
  if (!fallback) throw new Error(`No meal size available for plan ${planKey}`);
  return { mealSize: fallback, isCustomFallback: true };
}

// ---------- plan ----------

/** Base meal + add-on portions. An extra sabzi keeps its own diet; an extra roti, rice,
 * raita or salad joins the base meal's row for that category (whatever diet that row is
 * tagged with), else rides on the meal's diet. */
function withAddons(base: CustomMealItem[], addons: CustomMealItem[], mealPlan: string, units: Map<string, CategoryUnit>): CustomMealItem[] {
  const extra = addons.map((a) =>
    a.category === "sabzi" ? a : { ...a, planKey: base.find((b) => b.category === a.category)?.planKey ?? mealPlan });
  return normalizeItems([...base, ...extra], units);
}

export type PlanResult =
  // customItems: a WordPress custom meal; mealSize is then only a report placeholder and
  // applyOne swaps in the find-or-created custom meal size.
  // unmappedAddons: WordPress add-on text the parser could not turn into portions; staff handle it.
  | { kind: "planned"; record: MigrationRecord; mealSize: CatalogMealSize; isCustomFallback: boolean; customItems?: CustomMealItem[]; unmappedAddons?: string }
  | { kind: "skipped"; wpOrderId: number; reason: string };

function redactPhone(phone: string): string {
  return phone.length > 4 ? `***${phone.slice(-4)}` : phone;
}

const MANUAL_MAPPING = "custom meal, map by hand";

export function planSeed(rows: WpRow[], snapshot: CatalogSnapshot, units: Map<string, CategoryUnit>): { results: PlanResult[]; duplicates: MigrationRecord[]; mixedKind: ReturnType<typeof mixedKindDuplicates> } {
  const results: PlanResult[] = [];
  const candidates: MigrationRecord[] = [];
  const customByWpId = new Map<number, CustomMealItem[]>();
  for (const row of rows) {
    const record = mapRow(row);
    const skip = (reason: string) => results.push({ kind: "skipped", wpOrderId: row.id, reason });
    if (!/^\d{10}$/.test(record.phone)) { skip(`phone not 10 digits: "${row.phone ?? ""}"`); continue; }
    if (!emailSchema.safeParse(record.email).success) { skip("no usable email (invite needs one)"); continue; }
    // Diet comes from the parsed items, so the WordPress veg meta can't conflict with it.
    let customItems: CustomMealItem[] | undefined;
    if (isCustomMeal(record.productText)) {
      customItems = parseCustomMealName(record.productText, units) ?? undefined;
      if (!customItems) { skip(`${MANUAL_MAPPING}: "${record.productText}"`); continue; }
      record.planKey = mealPlanKey(customItems);
    }
    if (!customItems && hasVegConflict(row)) { skip(`veg conflict: product "${record.productText}" vs meta "${row.veg}"`); continue; }
    if (record.tiffinCount <= 0) { skip("zero remaining tiffins"); continue; }
    if (!record.addressLine || !record.postalCode) { skip("missing address or postal code"); continue; }
    try {
      record.postalCode = parseCanadianPostalCode(record.postalCode);
    } catch {
      skip(`postal code not a full Canadian one: "${record.postalCode}"`);
      continue;
    }
    if (!matchZone(record.postalCode, snapshot.zones.filter((z) => z.active))) {
      skip(`outside every delivery zone: ${record.postalCode}`);
      continue;
    }
    if (customItems) customByWpId.set(record.wpOrderId, customItems);
    candidates.push(record);
  }
  const { kept, dropped } = dedupeByPhone(candidates);
  for (const record of kept) {
    try {
      tripsFor(record.frequencyKey, record.eatingDays);
      const parsedCustom = customByWpId.get(record.wpOrderId);
      const matched = parsedCustom ? null : matchMealSize(record.productText, record.planKey, snapshot.mealSizes);
      const addons = record.addonsText ? parseCustomMealName(record.addonsText, units) : null;
      const unmappedAddons = record.addonsText && !addons ? record.addonsText : undefined;
      // Add-ons are extra portions in every tiffin: the meal becomes base + add-ons, a custom meal.
      const baseItems: CustomMealItem[] | undefined = parsedCustom
        ?? (addons ? matched!.mealSize.items.map((i) => ({ category: i.category, planKey: i.planKey ?? record.planKey, tuAmount: i.tuAmount })) : undefined);
      const customItems = baseItems && addons ? withAddons(baseItems, addons, record.planKey, units) : baseItems;
      if (customItems) {
        const placeholder = matched?.mealSize ?? snapshot.mealSizes.find((m) => m.planKey === record.planKey && !m.custom);
        if (!placeholder) throw new Error(`No meal size available for plan ${record.planKey}`);
        results.push({ kind: "planned", record, mealSize: placeholder, isCustomFallback: false, customItems, unmappedAddons });
        continue;
      }
      results.push({ kind: "planned", record, mealSize: matched!.mealSize, isCustomFallback: matched!.isCustomFallback, unmappedAddons });
    } catch (err) {
      results.push({ kind: "skipped", wpOrderId: record.wpOrderId, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results, duplicates: dropped, mixedKind: mixedKindDuplicates(kept, dropped) };
}

function printReport(totalRows: number, results: PlanResult[], duplicates: MigrationRecord[], mixedKind: ReturnType<typeof mixedKindDuplicates>, units: Map<string, CategoryUnit>): void {
  const planned = results.filter((r): r is Extract<PlanResult, { kind: "planned" }> => r.kind === "planned");
  const skipped = results.filter((r): r is Extract<PlanResult, { kind: "skipped" }> => r.kind === "skipped");
  const fallback = planned.filter((r) => r.isCustomFallback);

  console.log(`\n=== Customer seed report ===`);
  console.log(`WordPress active orders (${WP_STATUSES.join(", ")}): ${totalRows}`);
  console.log(`Planned customers: ${planned.length}  (meal size by heuristic: ${fallback.length}, custom meals: ${planned.filter((r) => r.customItems).length})`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Renewals merged into the running plan: ${planned.reduce((n, r) => n + r.record.mergedWpOrderIds.length, 0)}`);
  console.log(`Different second plan for the same phone (NOT imported, staff to handle): ${duplicates.length}`);
  for (const s of skipped) console.log(`  SKIP wc-${s.wpOrderId}: ${s.reason}`);
  for (const d of duplicates) console.log(`  DUP  wc-${d.wpOrderId} ${redactPhone(d.phone)} (${d.tiffinCount} left)`);
  console.log(`\n--- Custom meals needing manual mapping ---`);
  for (const s of skipped) if (s.reason.startsWith(MANUAL_MAPPING)) console.log(`  wc-${s.wpOrderId}: ${s.reason}`);
  for (const { kept, dropped } of mixedKind) {
    console.log(`  MIXED ${redactPhone(kept.phone)}: kept wc-${kept.wpOrderId} "${kept.productText}" (${kept.tiffinCount} left), NOT imported wc-${dropped.wpOrderId} "${dropped.productText}" (${dropped.tiffinCount} left)`);
  }
  console.log(`\n--- WordPress add-ons ---`);
  for (const r of planned) if (r.record.addonsText) {
    const x = r.record;
    console.log(`  wc-${x.wpOrderId} ${redactPhone(x.phone)} "${x.addonsText}" -> ${r.unmappedAddons ? "NOT MAPPED, staff to handle" : `folded into custom: ${compositionName(r.customItems!, units)}`}`);
  }
  console.log(`\n--- Planned ---`);
  for (const r of planned) {
    const x = r.record;
    console.log(
      `  wc-${x.wpOrderId} ${x.wpStatus.replace("wc-", "")} ${redactPhone(x.phone)} | ${x.planKey} "${r.customItems ? `custom: ${compositionName(r.customItems, units)}` : r.mealSize.name}"${r.isCustomFallback ? ` (heuristic from "${x.productText}")` : ""} | ${x.frequencyKey} eats=${x.eatingDays.join("/")} | persons=${x.persons} left=${x.tiffinCount}${x.mergedWpOrderIds.length ? ` (incl. wc-${x.mergedWpOrderIds.join(", wc-")})` : ""}`,
    );
  }
}

// ---------- apply ----------

type Outcome = "created" | "refreshed" | "unchanged (already started)" | "failed";

async function brandOrgId(): Promise<string | null> {
  const [row] = await db.select({ id: organization.id }).from(organization).where(isNull(organization.parentOrganizationId)).limit(1);
  return row?.id ?? null;
}

export async function applyOne(r: Extract<PlanResult, { kind: "planned" }>, snapshot: CatalogSnapshot, orgId: string | null, today: string): Promise<Outcome> {
  const x = r.record;
  const deploymentId = `wc-${x.wpOrderId}`;
  // phoneSchema() crashes under tsx (libphonenumber CJS/ESM interop); planSeed already
  // required 10 NANP digits, so this is the E.164 form phoneSchema would store.
  const phone = `+1${x.phone}`;
  const plan = snapshot.plans.find((p) => p.key === x.planKey);
  const frequency = snapshot.frequencies.find((f) => f.key === x.frequencyKey);
  if (!plan || !frequency) throw new Error(`catalog has no plan ${x.planKey} / frequency ${x.frequencyKey}`);

  const trips = tripsFor(x.frequencyKey, x.eatingDays);
  const perWeek = trips.reduce((n, t) => n + t.units * x.persons, 0);
  // Pick up where WordPress left off: the first trip after its last delivered box, or its
  // own start date if it never delivered. Never in the past; staff can still change it.
  const due = x.lastDeliveredDate ? nextTripDate(x.lastDeliveredDate, trips) : x.sourceStartDate || today;
  const startDate = due > today ? due : today;
  const contact = {
    fullName: x.fullName || "Customer",
    addressLine: x.addressLine,
    addressUnit: x.addressUnit,
    city: x.city,
    postalCode: x.postalCode,
    deliveryInstructions: x.deliveryInstructions,
  };
  const zone = await findZone(snapshot.zones, { postalCode: x.postalCode, address: x.addressLine }, orgId);

  // Prepaid on WordPress: the order carries the balance, not a price. A zero-value
  // receipt keeps every pricing_snapshot reader working without inventing revenue.
  const pricingSnapshot: OrderPricingSnapshot = {
    lineItems: [{ label: `${x.productText || r.mealSize.name} (prepaid on WordPress, order #${x.wpOrderId})`, amount: 0 }],
    adjustments: [],
    taxLines: [],
    taxTotal: 0,
    tiffinCount: x.tiffinCount,
    perTiffinPrice: 0,
    subtotal: 0,
    total: 0,
    paymentMethodId: "simulated",
    planType: plan.planType,
    wordpress: {
      orderId: x.wpOrderId,
      mergedOrderIds: x.mergedWpOrderIds,
      lastDeliveredDate: x.lastDeliveredDate,
      deliveredCount: x.deliveredCount,
      refreshedOn: today,
    },
  };
  const baseFields = {
    planId: plan.id,
    frequencyId: frequency.id,
    persons: x.persons,
    eatingDays: x.eatingDays,
    includeSaturday: x.eatingDays.includes("sat"),
    includeSunday: x.eatingDays.includes("sun"),
    durationWeeks: Math.max(1, Math.ceil(x.tiffinCount / Math.max(1, perWeek))),
    tiffinCount: x.tiffinCount,
    startDate,
    pricingSnapshot,
    zoneId: zone?.id ?? null,
    ...contact,
  };

  return db.transaction(async (tx) => {
    // Resolved only once the order is known to be written, so a skipped row never leaves a custom size.
    const planFields = async () => {
      let mealSizeId = r.mealSize.id;
      let categoryCounts = categoryCountsFromItems(r.mealSize.items);
      if (r.customItems) {
        const size = await findOrCreateCustomMealSize(r.customItems, { actorId: null, tx });
        mealSizeId = size.id;
        categoryCounts = categoryCountsFromItems(r.customItems);
      }
      return { ...baseFields, mealSizeId, mealSlots: Object.keys(categoryCounts), categoryCounts };
    };

    // A renewal merged into this record may already be imported under its own id (an earlier
    // run kept it separately); that order is this plan, so refresh it rather than add another.
    const planIds = [deploymentId, ...x.mergedWpOrderIds.map((id) => `wc-${id}`)];
    const found = await tx.select({ id: orders.id, status: orders.status, deploymentId: orders.deploymentId }).from(orders)
      .where(inArray(orders.deploymentId, planIds));
    const existingOrder = found.find((o) => o.deploymentId === deploymentId) ?? found[0];
    if (existingOrder) {
      if (existingOrder.status !== "pending") return "unchanged (already started)";
      await tx.update(orders).set({ ...(await planFields()), updatedAt: Date.now() }).where(eq(orders.id, existingOrder.id));
      return "refreshed";
    }

    // Phone first (provisionCustomerByPhone's key), else the same email under another number.
    const [existingUser] = await tx.select({ id: users.id, role: users.role }).from(users)
      .where(or(eq(users.phone, phone), eq(users.email, x.email))).limit(1);
    if (existingUser && existingUser.role !== "user") throw new Error("phone/email belongs to a staff account");
    // R13: plans cannot overlap, so a second live plan would double-book the customer's days.
    if (existingUser) {
      const [live] = await tx.select({ deploymentId: orders.deploymentId }).from(orders)
        .where(and(eq(orders.userId, existingUser.id), inArray(orders.status, ["pending", "active", "paused"]), ne(orders.deploymentId, deploymentId)))
        .limit(1);
      if (live) throw new Error(`customer already has a live plan: ${live.deploymentId}`);
    }
    const userId = existingUser?.id ?? await provisionCustomerByPhone(tx, { fullName: contact.fullName, phone, email: x.email, addressLine: x.addressLine, city: x.city, postalCode: x.postalCode }, null);

    const address = await addressService.create({ userId, orgId }, contact, { tx, coords: null });

    const [order] = await tx.insert(orders).values({
      ...(await planFields()),
      userId,
      status: "pending",
      deploymentId,
      perTiffinPrice: "0.00",
      total: "0.00",
      addressId: address.id,
      organizationId: orgId,
    }).returning({ id: orders.id });

    await tx.insert(orderActivities).values([
      { orderId: order.id, type: "created" as const, toStatus: "pending" as const },
      { orderId: order.id, type: "note" as const, note: `${MIGRATION_TAG} order #${x.wpOrderId} (${x.wpStatus})${x.mergedWpOrderIds.length ? ` + renewal #${x.mergedWpOrderIds.join(", #")}` : ""}, ${x.tiffinCount} tiffins left${x.addonsText ? `, WordPress add-ons: ${x.addonsText}${r.unmappedAddons ? " (not mapped)" : ""}` : ""}` },
    ]);
    return "created";
  });
}

async function apply(planned: Extract<PlanResult, { kind: "planned" }>[], snapshot: CatalogSnapshot): Promise<void> {
  const orgId = await brandOrgId();
  const today = zonedDateIso(Date.now(), (await getAppSettings()).timezone);
  const counts: Record<Outcome, number> = { created: 0, refreshed: 0, "unchanged (already started)": 0, failed: 0 };
  for (const r of planned) {
    let outcome: Outcome;
    try {
      outcome = await applyOne(r, snapshot, orgId, today);
    } catch (err) {
      outcome = "failed";
      // Drizzle's "Failed query: <sql>" hides the real reason in `cause`; print that instead.
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : null;
      console.log(`  FAILED wc-${r.record.wpOrderId}: ${cause ?? (err instanceof Error ? err.message : String(err))}`);
    }
    counts[outcome]++;
  }
  // Custom meal sizes were created inside per-order transactions, which skip the cache flush.
  await invalidateCatalogSnapshot();
  console.log(`\n=== Apply summary ===`);
  for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`);
}

// ---------- balance check ----------

/** Tiffins left in our DB vs WordPress's live counter, per imported plan. A pending plan must
 * equal WordPress after a refresh; a started plan must not have gone down on WordPress since
 * (that means WordPress kept delivering after the switch: two deliveries a day). */
export async function balanceCheck(planned: Extract<PlanResult, { kind: "planned" }>[]): Promise<{ mismatches: number }> {
  const inDb = await db.select({ deploymentId: orders.deploymentId, status: orders.status, tiffinCount: orders.tiffinCount })
    .from(orders).where(like(orders.deploymentId, "wc-%"));
  const byId = new Map(inDb.map((o) => [o.deploymentId, o]));
  // Same lookup as applyOne: a plan may sit under its own id or a merged renewal's.
  const planIdsOf = (x: MigrationRecord) => [x.wpOrderId, ...x.mergedWpOrderIds].map((id) => `wc-${id}`);
  const wanted = new Set(planned.flatMap((r) => planIdsOf(r.record)));
  let match = 0;
  const willRefresh: string[] = [];
  const doubleDelivery: string[] = [];
  const notImported: string[] = [];
  for (const { record: x } of planned) {
    const ids = planIdsOf(x);
    const o = ids.map((i) => byId.get(i)).find(Boolean);
    const id = o?.deploymentId ?? ids[0];
    if (!o) { notImported.push(`${id} (WordPress ${x.tiffinCount} left)`); continue; }
    if (o.status === "pending") {
      if (o.tiffinCount === x.tiffinCount) match++;
      else willRefresh.push(`${id}: ours ${o.tiffinCount}, WordPress ${x.tiffinCount}`);
    } else if (o.status !== "cancelled" && x.tiffinCount < o.tiffinCount) {
      doubleDelivery.push(`${id} (${o.status}): started with ${o.tiffinCount}, WordPress now ${x.tiffinCount}`);
    } else {
      match++;
    }
  }
  const goneFromWordPress = inDb.filter((o) => o.status === "pending" && !wanted.has(o.deploymentId)).map((o) => o.deploymentId);

  console.log(`\n=== Tiffins left vs WordPress ===`);
  console.log(`Match: ${match}`);
  console.log(`Pending, differs (a refresh / --apply updates these): ${willRefresh.length}`);
  for (const l of willRefresh) console.log(`  ${l}`);
  console.log(`Not imported yet: ${notImported.length}`);
  for (const l of notImported) console.log(`  ${l}`);
  console.log(`Started but WordPress kept delivering (stop them on WordPress!): ${doubleDelivery.length}`);
  for (const l of doubleDelivery) console.log(`  ${l}`);
  console.log(`Pending here, no longer an active WordPress plan (ended, cancelled or now skipped): ${goneFromWordPress.length}`);
  for (const l of goneFromWordPress) console.log(`  ${l}`);
  return { mismatches: willRefresh.length + doubleDelivery.length + notImported.length + goneFromWordPress.length };
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  (async () => {
    const rows = await readWordPress();
    const snapshot = await loadCatalogSnapshot();
    const units = await loadCategoryUnits();
    const { results, duplicates, mixedKind } = planSeed(rows, snapshot, units);
    printReport(rows.length, results, duplicates, mixedKind, units);
    const planned = results.filter((r): r is Extract<PlanResult, { kind: "planned" }> => r.kind === "planned");
    await balanceCheck(planned);
    if (!process.argv.includes("--apply")) {
      console.log(`\nDry run only — pass --apply to write.`);
      return;
    }
    await apply(planned, snapshot);
    console.log(`\nAfter apply:`);
    await balanceCheck(planned);
  })()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
