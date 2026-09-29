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
import { compositionName, mealPlanKey, type CategoryUnit, type CustomMealItem } from "../lib/custom-meal/composition";
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

const WEEKDAY_NAMES: { name: string; day: DayOfWeek }[] = [
  { name: "monday", day: "mon" },
  { name: "tuesday", day: "tue" },
  { name: "wednesday", day: "wed" },
  { name: "thursday", day: "thu" },
  { name: "friday", day: "fri" },
];
const WEEK_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function sameDaySet(a: DayOfWeek[], b: DayOfWeek[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

// The legacy plugin encodes exactly two named PLANS as fixed literal phrases,
// not day-by-day checkboxes: "Monday - Wednesday - Friday" (the alternate/MWF
// plan) and "Monday - Friday" (the standard full-week plan — a range label,
// NOT two individually-picked days despite matching the same dash-joined
// format). Verified against real tiffin_count_history delivery logs: an order
// with the literal text "Monday - Friday" has boxes_delivered firing
// continuously Mon..Fri, not just on Monday and Friday. This phrase covers the
// large majority of in-scope orders — matching it as two literal days would
// migrate most customers onto a bogus 2x/week schedule. Everything else (a
// genuinely different dash-joined day list) is treated as an actual custom pick.
const PHRASE_5_DAY = "monday - friday";
const PHRASE_MWF = "monday - wednesday - friday";

function stripWeekendSuffix(text: string): string {
  return text.replace(/\s*-\s*(saturday|sunday)\b/gi, "").trim();
}

function parsePreferredDays(raw: string | null): { frequencyKey: "5_day" | "mwf"; eatingDays: DayOfWeek[]; includeSaturday: boolean; includeSunday: boolean } {
  const text = (raw ?? "").trim();
  const includeSaturday = /saturday/i.test(text);
  const includeSunday = /sunday/i.test(text);
  const corePhrase = stripWeekendSuffix(text).toLowerCase();
  const withWeekend = (core: DayOfWeek[]): DayOfWeek[] =>
    WEEK_ORDER.filter((d) => core.includes(d) || (d === "sat" && includeSaturday) || (d === "sun" && includeSunday));
  const FIVE: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];

  if (text === "" || corePhrase === PHRASE_5_DAY) {
    return { frequencyKey: "5_day", eatingDays: withWeekend(FIVE), includeSaturday, includeSunday };
  }
  if (corePhrase === PHRASE_MWF) {
    return { frequencyKey: "mwf", eatingDays: withWeekend(["mon", "wed", "fri"]), includeSaturday, includeSunday };
  }
  const core = WEEKDAY_NAMES.filter((t) => new RegExp(`\\b${t.name}\\b`, "i").test(text)).map((t) => t.day);
  if (core.length === 0 || sameDaySet(core, FIVE)) {
    return { frequencyKey: "5_day", eatingDays: withWeekend(FIVE), includeSaturday, includeSunday };
  }
  // Any other pick is the customer's eating days on the 5-day route; no per-pattern frequency row.
  return { frequencyKey: "5_day", eatingDays: withWeekend(core), includeSaturday, includeSunday };
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
    a.productText === b.productText && a.persons === b.persons && a.eatingDays.join() === b.eatingDays.join();
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

export type PlanResult =
  // customItems: a WordPress custom meal; mealSize is then only a report placeholder and
  // applyOne swaps in the find-or-created custom meal size.
  | { kind: "planned"; record: MigrationRecord; mealSize: CatalogMealSize; isCustomFallback: boolean; customItems?: CustomMealItem[] }
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
      const customItems = customByWpId.get(record.wpOrderId);
      if (customItems) {
        const placeholder = snapshot.mealSizes.find((m) => m.planKey === record.planKey && !m.custom);
        if (!placeholder) throw new Error(`No meal size available for plan ${record.planKey}`);
        results.push({ kind: "planned", record, mealSize: placeholder, isCustomFallback: false, customItems });
        continue;
      }
      const { mealSize, isCustomFallback } = matchMealSize(record.productText, record.planKey, snapshot.mealSizes);
      results.push({ kind: "planned", record, mealSize, isCustomFallback });
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
    tier: snapshot.tiers[0] ?? { minQty: 1, maxQty: null, upliftPct: 0 },
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

    const [existingOrder] = await tx.select({ id: orders.id, status: orders.status }).from(orders)
      .where(eq(orders.deploymentId, deploymentId)).limit(1);
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
      { orderId: order.id, type: "note" as const, note: `${MIGRATION_TAG} order #${x.wpOrderId} (${x.wpStatus})${x.mergedWpOrderIds.length ? ` + renewal #${x.mergedWpOrderIds.join(", #")}` : ""}, ${x.tiffinCount} tiffins left` },
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
      console.log(`  FAILED wc-${r.record.wpOrderId}: ${err instanceof Error ? err.message : String(err)}`);
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
  const wanted = new Set(planned.map((r) => `wc-${r.record.wpOrderId}`));
  let match = 0;
  const willRefresh: string[] = [];
  const doubleDelivery: string[] = [];
  const notImported: string[] = [];
  for (const { record: x } of planned) {
    const id = `wc-${x.wpOrderId}`;
    const o = byId.get(id);
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
