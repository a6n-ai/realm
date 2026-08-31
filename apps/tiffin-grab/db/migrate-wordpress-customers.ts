/**
 * One-off migration: imports real, currently-active customers from the
 * WordPress order export into this app's DB (users + orders + deliveries),
 * bypassing checkout pricing math for the tiffin count (a migrated customer's
 * real remaining balance is preserved exactly, not recomputed).
 *
 * Usage:
 *   EXPORT_PATH=/path/to/export.xls DATABASE_URL=... tsx db/migrate-wordpress-customers.ts          # dry run (default)
 *   EXPORT_PATH=/path/to/export.xls DATABASE_URL=... tsx db/migrate-wordpress-customers.ts --apply   # writes to the DB
 *
 * Idempotent: apply mode skips any phone that already has an order tagged
 * with the MIGRATION_TAG note, so re-running after a partial failure is safe.
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { cutoffMsFor, nextWeekday } from "@realm/commons";
import { db } from "./client";
import { deliveries, orderActivities, orders, users } from "./schema";
import { createOrder } from "../lib/services/orders.service";
import { loadCatalogSnapshot } from "../lib/catalog/load";
import { getAppSettings } from "../lib/services/app-settings.service";
import { subscriptionDeliveryDates, type DayOfWeek } from "../lib/menu/delivery-dates";
import { orderDeliveryDays } from "../lib/menu/delivery-days";
import { normalisePhone } from "../lib/services/optimoroute/push";

const MIGRATION_TAG = "Migrated from WordPress export";
const TARGET_STATUSES = new Set(["Processing", "Paused", "On hold"]);

// ---------- export parsing ----------

type ExportRow = {
  Customer: string;
  Phone: string;
  Email: string;
  Address: string;
  City: string;
  "Postal Code": string;
  "Preferred Days": string;
  Products: string;
  Quantity: string;
  "Veg/Non-Veg": string;
  Status: string;
  "Total Tiffins": string;
  "Remaining Tiffins": string;
  "Start Date": string;
};

function readExport(path: string): ExportRow[] {
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<ExportRow>(sheet, { raw: false });
}

// ---------- field mapping (pure) ----------

export type MigrationRecord = {
  fullName: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  postalCode: string;
  planKey: "veg" | "non-veg";
  productText: string;
  frequencyKey: "5_day" | "mwf";
  includeSaturday: boolean;
  includeSunday: boolean;
  persons: number;
  tiffinCount: number;
  sourceStartDate: string;
};

function parsePreferredDays(raw: string): { frequencyKey: "5_day" | "mwf"; includeSaturday: boolean; includeSunday: boolean } {
  const text = (raw ?? "").trim();
  const frequencyKey = text === "Monday - Wednesday - Friday" ? "mwf" : "5_day";
  return {
    frequencyKey,
    includeSaturday: /saturday/i.test(text),
    includeSunday: /sunday/i.test(text),
  };
}

function planKeyFor(row: ExportRow): "veg" | "non-veg" {
  const v = (row["Veg/Non-Veg"] ?? "").trim().toLowerCase();
  if (v === "veg") return "veg";
  if (v === "non-veg") return "non-veg";
  return /non-veg/i.test(row.Products ?? "") ? "non-veg" : "veg";
}

// A handful of rows have a Products name that unambiguously says one diet
// while the separate Veg/Non-Veg preference column says the other (e.g.
// Products="4 Item Veg Thali Meal (Large)", column="Non-Veg"). Rather than
// guess which field is stale, these get excluded and flagged for manual
// review — see the "ignore such cases" decision.
function hasVegConflict(row: ExportRow): boolean {
  const col = (row["Veg/Non-Veg"] ?? "").trim().toLowerCase();
  if (col !== "veg" && col !== "non-veg") return false;
  const prod = (row.Products ?? "").toLowerCase();
  const prodSaysNonVeg = /non-veg|nonveg/.test(prod);
  const prodSaysVeg = /\bveg\b/.test(prod) && !prodSaysNonVeg;
  if (col === "veg" && prodSaysNonVeg) return true;
  if (col === "non-veg" && prodSaysVeg) return true;
  return false;
}

export function mapRow(row: ExportRow): MigrationRecord {
  const { frequencyKey, includeSaturday, includeSunday } = parsePreferredDays(row["Preferred Days"]);
  return {
    fullName: (row.Customer ?? "").trim(),
    // Excel export prefixes phone-like columns with a stray leading "'" to
    // force text formatting (e.g. "'6475405419") — normalisePhone() strips
    // all non-digits, so it doubles as the fix for that.
    phone: normalisePhone(row.Phone),
    email: (row.Email ?? "").trim(),
    addressLine: (row.Address ?? "").trim(),
    city: (row.City ?? "").trim(),
    postalCode: (row["Postal Code"] ?? "").trim(),
    planKey: planKeyFor(row),
    productText: (row.Products ?? "").trim(),
    frequencyKey,
    includeSaturday,
    includeSunday,
    persons: Number(row.Quantity) || 1,
    tiffinCount: Math.max(0, Math.round(Number(row["Remaining Tiffins"]) || 0)),
    sourceStartDate: (row["Start Date"] ?? "").trim(),
  };
}

// ---------- dedup ----------

function dedupeByPhone(rows: ExportRow[]): ExportRow[] {
  const byPhone = new Map<string, ExportRow>();
  for (const row of rows) {
    const phone = normalisePhone(row.Phone);
    if (!phone) continue;
    const existing = byPhone.get(phone);
    if (!existing) {
      byPhone.set(phone, row);
      continue;
    }
    const existingRemaining = Number(existing["Remaining Tiffins"]) || 0;
    const rowRemaining = Number(row["Remaining Tiffins"]) || 0;
    if (rowRemaining > existingRemaining) {
      byPhone.set(phone, row);
    } else if (rowRemaining === existingRemaining) {
      const existingStart = Date.parse(existing["Start Date"]) || 0;
      const rowStart = Date.parse(row["Start Date"]) || 0;
      if (rowStart > existingStart) byPhone.set(phone, row);
    }
  }
  return [...byPhone.values()];
}

// ---------- meal size matching ----------

type CatalogMealSize = Awaited<ReturnType<typeof loadCatalogSnapshot>>["mealSizes"][number];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Structured product names (anything that isn't genuinely free-text "Custom
// Meal - ...") carry enough signal — item count, size, or a named tier like
// "Maharaja"/"Trial"/"New Plan"/"Sabzi Only" — to map directly onto the
// catalog's own key taxonomy (e.g. "nonveg_4_regular"), regardless of word
// order or an extra trailing "(Regular)"/"Meal". This is far more reliable
// than string-equality or a generic size heuristic, and it's what lets
// "Veg 4 Item Thali (Large)" and "4 Item Veg Thali Meal (Large)" both resolve
// to the same catalog entry despite differing word order/plan-column noise.
function detectShapeKeySuffix(productText: string): string | null {
  const t = normalize(productText);
  if (/\btrial\b/.test(t)) return "trial";
  if (/\bmaharaja\b/.test(t)) return "maharaja";
  if (/\bnew plan\b/.test(t)) return "new_plan";
  if (/\bsabzi only\b/.test(t)) return "sabzi_only";
  if (/\bsmall thali\b/.test(t)) return "small_thali";
  const hasItemWord = /\bitem\b/.test(t);
  const isLarge = /\blarge\b/.test(t);
  if (hasItemWord && /\b5\b/.test(t)) return isLarge ? "5_large" : "5_regular";
  if (hasItemWord && /\b4\b/.test(t)) return isLarge ? "4_large" : "4_regular";
  return null;
}

function matchMealSize(productText: string, planKey: "veg" | "non-veg", mealSizes: CatalogMealSize[]): { mealSize: CatalogMealSize; isCustomFallback: boolean } {
  const candidates = mealSizes.filter((m) => m.planKey === planKey);
  const planPrefix = planKey === "veg" ? "veg" : "nonveg";

  const normProduct = normalize(productText.replace(/\bmeal\b/i, ""));
  const exact = candidates.find((m) => normalize(m.name) === normProduct);
  if (exact) return { mealSize: exact, isCustomFallback: false };

  const shape = detectShapeKeySuffix(productText);
  if (shape) {
    // Named tiers (small_thali/sabzi_only/new_plan/maharaja/trial) key as
    // `${shape}_${planPrefix}`; sized tiers (4_regular etc.) key the other way
    // round, matching db/seed.sql's actual key naming.
    const namedTierKey = `${shape}_${planPrefix}`;
    const sizedTierKey = `${planPrefix}_${shape}`;
    const byKey = candidates.find((m) => m.key === namedTierKey || m.key === sizedTierKey);
    if (byKey) return { mealSize: byKey, isCustomFallback: false };
    // Shape detected but this plan has no matching catalog entry (e.g.
    // "small_thali" has no non-veg variant) — fall back to the closest tier.
    const tierGuess = shape === "trial" || shape === "maharaja" || shape.endsWith("large") ? "premium"
      : shape === "sabzi_only" || shape === "small_thali" ? "budget" : "medium";
    const byTier = candidates.filter((m) => m.tier === tierGuess);
    const fallback = byTier[0] ?? candidates[0];
    if (!fallback) throw new Error(`No meal size available for plan ${planKey}`);
    return { mealSize: fallback, isCustomFallback: true };
  }

  // Genuinely free-text ("Custom Meal - 1 Non-Veg(12oz) + 1 Veg(8oz) + ...")
  // with no detectable shape: heuristic tier by counting '+'-separated
  // components. 1 -> budget, 2 -> medium(4-item), 3+ -> premium(5-item/large).
  const componentCount = productText.split("+").length;
  const tier = componentCount <= 1 ? "budget" : componentCount === 2 ? "medium" : "premium";
  const byTier = candidates.filter((m) => m.tier === tier);
  const fallback = byTier[0] ?? candidates[0];
  if (!fallback) throw new Error(`No meal size available for plan ${planKey}`);
  return { mealSize: fallback, isCustomFallback: true };
}

// ---------- bounded delivery generation (mirrors materializeDeliveries, but
// stops once cumulative tiffinUnits reaches a target instead of after a fixed
// week count — see plan file for why materializeDeliveries can't be reused) ----------

const WEEKEND = new Set(["sat", "sun"]);

function isoDaysBefore(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function buildBoundedDeliveryRows(input: {
  startDate: string;
  deliveryDays: DayOfWeek[];
  persons: number;
  targetTiffinCount: number;
}): { deliveryDate: string; tiffinUnits: number }[] {
  const minUnitsPerWeek = input.deliveryDays.filter((d) => !WEEKEND.has(d)).length * input.persons;
  const weeksNeeded = Math.ceil(input.targetTiffinCount / Math.max(1, minUnitsPerWeek)) + 3;

  const dates = subscriptionDeliveryDates({
    startDate: input.startDate,
    durationWeeks: weeksNeeded,
    deliveryDays: input.deliveryDays,
  });

  type Row = { deliveryDate: string; tiffinUnits: number };
  const rows: Row[] = [];
  const rowByDate = new Map<string, Row>();
  for (const d of dates) {
    if (d.dayOfWeek === "sat" || d.dayOfWeek === "sun") {
      const fridayIso = isoDaysBefore(d.dateIso, d.dayOfWeek === "sat" ? 1 : 2);
      const friday = rowByDate.get(fridayIso);
      if (friday) {
        friday.tiffinUnits += input.persons;
        continue;
      }
    }
    const newRow: Row = { deliveryDate: d.dateIso, tiffinUnits: input.persons };
    rows.push(newRow);
    rowByDate.set(d.dateIso, newRow);
  }

  // Truncate at the row that first reaches the target. A bundled Friday
  // (base + weekend add-on, >1 tiffinUnits) can land exactly on that
  // boundary — keeping it whole would over-deliver real, already-paid-for
  // tiffins beyond the customer's actual remaining balance, so the crossing
  // row's units get clamped to exactly what's left instead of dropped or
  // taken whole.
  let cumulative = 0;
  const kept: Row[] = [];
  for (const row of rows) {
    if (cumulative >= input.targetTiffinCount) break;
    const remaining = input.targetTiffinCount - cumulative;
    const units = Math.min(row.tiffinUnits, remaining);
    kept.push({ ...row, tiffinUnits: units });
    cumulative += units;
  }
  return kept;
}

// ---------- report shape ----------

export type PlanResult =
  | { kind: "planned"; phone: string; record: MigrationRecord; mealSizeName: string; isCustomFallback: boolean; deliveryRowCount: number; firstDate: string; lastDate: string }
  | { kind: "skipped_no_phone"; name: string }
  | { kind: "skipped_zero_tiffins"; phone: string }
  | { kind: "skipped_veg_conflict"; phone: string; products: string; vegNonVegColumn: string }
  | { kind: "error"; phone: string; message: string };

function redactPhone(phone: string): string {
  return phone.length > 4 ? `***${phone.slice(-4)}` : phone;
}

export async function planMigration(): Promise<{ results: PlanResult[]; totalRaw: number; totalDeduped: number }> {
  const exportPath = process.env.EXPORT_PATH;
  if (!exportPath) throw new Error("EXPORT_PATH env var is required");
  const allRows = readExport(exportPath);
  const population = allRows.filter((r) => TARGET_STATUSES.has((r.Status ?? "").trim()));
  const deduped = dedupeByPhone(population);

  const snapshot = await loadCatalogSnapshot();
  const results: PlanResult[] = [];

  for (const row of deduped) {
    const record = mapRow(row);
    if (!record.phone) {
      results.push({ kind: "skipped_no_phone", name: record.fullName });
      continue;
    }
    if (hasVegConflict(row)) {
      results.push({
        kind: "skipped_veg_conflict",
        phone: redactPhone(record.phone),
        products: record.productText,
        vegNonVegColumn: (row["Veg/Non-Veg"] ?? "").trim(),
      });
      continue;
    }
    if (record.tiffinCount <= 0) {
      results.push({ kind: "skipped_zero_tiffins", phone: redactPhone(record.phone) });
      continue;
    }
    try {
      const { mealSize, isCustomFallback } = matchMealSize(record.productText, record.planKey, snapshot.mealSizes);
      const startDate = nextWeekday(new Date()).toISOString().slice(0, 10);
      const deliveryDays = orderDeliveryDays({
        frequencyKey: record.frequencyKey,
        includeSaturday: record.includeSaturday,
        includeSunday: record.includeSunday,
      });
      const rows = buildBoundedDeliveryRows({
        startDate,
        deliveryDays,
        persons: record.persons,
        targetTiffinCount: record.tiffinCount,
      });
      results.push({
        kind: "planned",
        phone: redactPhone(record.phone),
        record,
        mealSizeName: mealSize.name,
        isCustomFallback,
        deliveryRowCount: rows.length,
        firstDate: rows[0]?.deliveryDate ?? "",
        lastDate: rows[rows.length - 1]?.deliveryDate ?? "",
      });
    } catch (err) {
      results.push({ kind: "error", phone: redactPhone(record.phone), message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { results, totalRaw: population.length, totalDeduped: deduped.length };
}

export function printReport(results: PlanResult[], totalRaw: number, totalDeduped: number): void {
  const planned = results.filter((r): r is Extract<PlanResult, { kind: "planned" }> => r.kind === "planned");
  const errors = results.filter((r): r is Extract<PlanResult, { kind: "error" }> => r.kind === "error");
  const noPhone = results.filter((r) => r.kind === "skipped_no_phone");
  const zeroTiffins = results.filter((r) => r.kind === "skipped_zero_tiffins");
  const customFallback = planned.filter((r) => r.isCustomFallback);

  console.log(`\n=== Migration dry-run report ===`);
  const vegConflicts = results.filter((r): r is Extract<PlanResult, { kind: "skipped_veg_conflict" }> => r.kind === "skipped_veg_conflict");

  console.log(`Raw population (Processing+Paused+On hold): ${totalRaw}`);
  console.log(`After phone dedup: ${totalDeduped}`);
  console.log(`Planned to import: ${planned.length}`);
  console.log(`  - via meal-size fallback heuristic (custom/unmatched product): ${customFallback.length}`);
  console.log(`Skipped (no phone): ${noPhone.length}`);
  console.log(`Skipped (zero remaining tiffins): ${zeroTiffins.length}`);
  console.log(`Skipped (Products vs Veg/Non-Veg column conflict, needs manual review): ${vegConflicts.length}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) {
    console.log(`\n--- Errors ---`);
    for (const e of errors) console.log(`  ${e.phone}: ${e.message}`);
  }
  if (vegConflicts.length) {
    console.log(`\n--- Veg/Non-Veg conflicts (excluded, needs manual review) ---`);
    for (const c of vegConflicts) console.log(`  ${c.phone} | products="${c.products}" | column="${c.vegNonVegColumn}"`);
  }
  console.log(`\n--- Sample of 15 planned rows ---`);
  for (const r of planned.slice(0, 15)) {
    console.log(
      `  ${r.phone} | plan=${r.record.planKey} size="${r.mealSizeName}"${r.isCustomFallback ? " (fallback)" : ""} | freq=${r.record.frequencyKey} sat=${r.record.includeSaturday} sun=${r.record.includeSunday} | persons=${r.record.persons} tiffinCount=${r.record.tiffinCount} | rows=${r.deliveryRowCount} (${r.firstDate}..${r.lastDate})`,
    );
  }
  console.log(`\n--- All custom-fallback rows (for review) ---`);
  for (const r of customFallback) {
    console.log(`  ${r.phone} | product="${r.record.productText}" -> size="${r.mealSizeName}" | tiffinCount=${r.record.tiffinCount}`);
  }
}

// ---------- apply ----------

async function alreadyMigrated(phone: string): Promise<boolean> {
  // record.phone is bare digits (normalisePhone's output); createOrder stores
  // it E.164-formatted via phoneSchema()'s transform, so the lookup must match
  // that shape or every idempotency check silently misses and re-runs duplicate.
  const e164 = `+1${phone}`;
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.phone, e164)).limit(1);
  if (!existingUser) return false;
  const [existingOrder] = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, existingUser.id)).limit(1);
  if (!existingOrder) return false;
  const [tagged] = await db
    .select({ id: orderActivities.id })
    .from(orderActivities)
    .where(eq(orderActivities.orderId, existingOrder.id))
    .limit(1);
  return !!tagged;
}

async function applyOne(record: MigrationRecord, mealSize: CatalogMealSize): Promise<{ ok: true; publicId: string } | { ok: false; reason: string }> {
  if (await alreadyMigrated(record.phone)) {
    return { ok: false, reason: "already migrated (idempotent skip)" };
  }

  const startDate = nextWeekday(new Date()).toISOString().slice(0, 10);
  const { publicId } = await createOrder({
    planKey: record.planKey,
    selections: {
      mealSizeId: mealSize.publicId,
      frequencyKey: record.frequencyKey,
      persons: record.persons,
      mealSlots: ["lunch"],
      includeSaturday: record.includeSaturday,
      includeSunday: record.includeSunday,
      durationWeeks: 1,
      startDate,
    },
    contact: {
      fullName: record.fullName || "Customer",
      phone: record.phone,
      email: record.email || `${record.phone.replace(/\D/g, "")}@migrated.tiffingrab.ca`,
      addressLine: record.addressLine || "Unknown",
      city: record.city || "Toronto",
      postalCode: record.postalCode || "M5V 2T6",
    },
    paymentMethodId: "simulated",
  });

  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  if (!order) throw new Error(`order ${publicId} vanished after createOrder`);

  const { timezone, cutoffHour } = await getAppSettings();
  const deliveryDays = orderDeliveryDays({
    frequencyKey: record.frequencyKey,
    includeSaturday: record.includeSaturday,
    includeSunday: record.includeSunday,
  });
  const rows = buildBoundedDeliveryRows({
    startDate,
    deliveryDays,
    persons: record.persons,
    targetTiffinCount: record.tiffinCount,
  });

  await db.transaction(async (tx) => {
    await tx.update(orders).set({ status: "active", tiffinCount: record.tiffinCount }).where(eq(orders.id, order.id));
    // createOrder already materialized its own default delivery calendar (durationWeeks: 1)
    // on insert above — replace it with the bounded schedule computed from the migrated
    // customer's real remaining balance, rather than colliding on deliveries_order_date_unique.
    await tx.delete(deliveries).where(eq(deliveries.orderId, order.id));
    if (rows.length > 0) {
      await tx.insert(deliveries).values(
        rows.map((r) => ({
          orderId: order.id,
          deliveryDate: r.deliveryDate,
          status: "scheduled" as const,
          cutoffAt: cutoffMsFor(r.deliveryDate, cutoffHour, timezone),
          tiffinUnits: r.tiffinUnits,
        })),
      );
    }
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "note",
      note: MIGRATION_TAG,
    });
  });

  return { ok: true, publicId };
}

export type ApplyOutcome = { phone: string; status: "created" | "skipped" | "failed"; detail: string };

export async function apply(results: PlanResult[]): Promise<{ created: number; skipped: number; failed: number; outcomes: ApplyOutcome[] }> {
  const planned = results.filter((r): r is Extract<PlanResult, { kind: "planned" }> => r.kind === "planned");
  const snapshot = await loadCatalogSnapshot();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const outcomes: ApplyOutcome[] = [];

  for (const r of planned) {
    try {
      const { mealSize } = matchMealSize(r.record.productText, r.record.planKey, snapshot.mealSizes);
      const outcome = await applyOne(r.record, mealSize);
      if (outcome.ok) {
        created++;
        outcomes.push({ phone: r.phone, status: "created", detail: outcome.publicId });
      } else {
        skipped++;
        outcomes.push({ phone: r.phone, status: "skipped", detail: outcome.reason });
      }
    } catch (err) {
      failed++;
      outcomes.push({ phone: r.phone, status: "failed", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return { created, skipped, failed, outcomes };
}

// CLI entry point. Guarded so importing this module (e.g. from the temporary
// /api/internal/run-wordpress-migration route, needed because createOrder's
// phone validation crashes under tsx's CJS/ESM interop — see the route file's
// comment) never triggers a run as a side effect of the import.
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const isApply = process.argv.includes("--apply");
  planMigration()
    .then(async ({ results, totalRaw, totalDeduped }) => {
      printReport(results, totalRaw, totalDeduped);
      if (!isApply) {
        console.log(`\nDry run only — pass --apply to write to the database.`);
        return;
      }
      console.log(`\n=== Applying to ${process.env.DATABASE_URL} ===`);
      const summary = await apply(results);
      for (const o of summary.outcomes) console.log(`  ${o.status.toUpperCase()} ${o.phone}: ${o.detail}`);
      console.log(`\n=== Apply summary ===`);
      console.log(`Created: ${summary.created}`);
      console.log(`Skipped (idempotent): ${summary.skipped}`);
      console.log(`Failed: ${summary.failed}`);
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
