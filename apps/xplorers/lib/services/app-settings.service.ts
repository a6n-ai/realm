import { ValidationError } from "@foundry/commons";
import { parsePaymentConfig, type PaymentConfig } from "@foundry/payments";
import { mergePaymentCatalog } from "@foundry/payments/providers";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { app, type DiscountSettings } from "@/db/schema";
import { CURRENCIES, isIanaTimeZone } from "@/lib/app-clock";
import { DEFAULT_PRICE_TABLE } from "@/lib/pricing/defaults";
import type { PriceTable } from "@/lib/pricing/types";
import { currentUserId, SessionUpdatableService } from "./session-service";

export type AppClock = { timezone: string; currency: string };

const DEFAULT_TIMEZONE = "Asia/Singapore";
const DEFAULT_CURRENCY = "CAD";

class AppSettingsService extends SessionUpdatableService<typeof app> {}

const appSettingsEntity = new AppSettingsService(
  new UpdatableRepository(db, app, app.publicId, app.id),
);

export async function getAppClock(): Promise<AppClock> {
  const [row] = await db.select({ timezone: app.timezone, currency: app.currency }).from(app).limit(1);
  return {
    timezone: row?.timezone ?? DEFAULT_TIMEZONE,
    currency: row?.currency ?? DEFAULT_CURRENCY,
  };
}

export async function setAppClock(input: { timezone: string; currency: string }): Promise<void> {
  if (!isIanaTimeZone(input.timezone)) throw new ValidationError("Pick a valid timezone.");
  if (!CURRENCIES.includes(input.currency as (typeof CURRENCIES)[number])) {
    throw new ValidationError("Unsupported currency.");
  }
  const actorId = await currentUserId();
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (!row) throw new ValidationError("App settings are not initialized.");
  await appSettingsEntity.update(row.publicId, {
    timezone: input.timezone,
    currency: input.currency,
    updatedBy: actorId,
  });
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const [row] = await db.select({ pc: app.paymentConfig }).from(app).limit(1);
  return parsePaymentConfig(row?.pc ?? undefined);
}

export async function setPaymentConfig(cfg: PaymentConfig): Promise<void> {
  const parsed = parsePaymentConfig(cfg);
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (!row) throw new ValidationError("App settings are not initialized.");
  await appSettingsEntity.update(row.publicId, { paymentConfig: parsed });
}

/**
 * Seed cash (on) + e-Transfer from Foundry's catalog. Drop the old card-style
 * "manual" rail — Stripe lands later as an online provider.
 */
export async function ensurePaymentCatalog(): Promise<PaymentConfig> {
  const cfg = await getPaymentConfig();
  const hadManual = cfg.methods.some((m) => m.id === "manual");
  const merged = mergePaymentCatalog(cfg);
  const methods = merged.methods
    .filter((m) => m.id !== "manual")
    .map((m) => (m.id === "cash" && hadManual ? { ...m, enabled: true } : m));
  const next: PaymentConfig = { ...merged, methods };
  const unchanged =
    next.methods.length === cfg.methods.length &&
    next.methods.every((m, i) => {
      const prev = cfg.methods[i];
      return prev && prev.id === m.id && prev.enabled === m.enabled && prev.label === m.label;
    });
  if (unchanged) return cfg;
  await setPaymentConfig(next);
  return next;
}

export async function getIntegrationsConfig(): Promise<Record<string, unknown>> {
  const [row] = await db.select({ cfg: app.integrationsConfig }).from(app).limit(1);
  return row?.cfg ?? {};
}

export async function setIntegrationsConfig(cfg: Record<string, unknown>): Promise<void> {
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (!row) throw new ValidationError("App settings are not initialized.");
  await appSettingsEntity.update(row.publicId, { integrationsConfig: cfg });
}

export const integrationsConfigStore = {
  get: getIntegrationsConfig,
  set: setIntegrationsConfig,
};

export async function getDiscountSettings(): Promise<DiscountSettings> {
  const [row] = await db.select({ ds: app.discountSettings }).from(app).limit(1);
  return { maxDiscountPct: row?.ds?.maxDiscountPct ?? 100 };
}

/** An empty field must not save as 0%, which would switch every discount off. */
export function normalizeCap(raw: unknown): number {
  const text = String(raw ?? "").trim();
  const pct = Number(text);
  if (text === "" || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new ValidationError("Cap must be a number between 0 and 100.");
  }
  return pct;
}

export async function setDiscountSettings(input: { maxDiscountPct: unknown }): Promise<void> {
  const pct = normalizeCap(input.maxDiscountPct);
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (!row) throw new ValidationError("App settings are not initialized.");
  await appSettingsEntity.update(row.publicId, { discountSettings: { maxDiscountPct: pct } });
}

export async function getMaxWalletBalance(): Promise<number | null> {
  const [row] = await db.select({ cap: app.maxWalletBalance }).from(app).limit(1);
  return row?.cap ?? null;
}

export async function setMaxWalletBalance(cap: number | null): Promise<void> {
  if (cap !== null && (!Number.isInteger(cap) || cap <= 0)) {
    throw new ValidationError("Max wallet balance must be a positive whole number, or blank for unlimited.");
  }
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (!row) throw new ValidationError("App settings are not initialized.");
  await appSettingsEntity.update(row.publicId, { maxWalletBalance: cap });
}

export function normalizePriceTable(input: PriceTable): PriceTable {
  const out: PriceTable = {};
  for (const [key, cell] of Object.entries(input)) {
    const m = /^len:(\d+)$/.exec(key);
    if (!m || Number(m[1]) <= 0) throw new ValidationError(`Invalid price row "${key}".`);
    const { weekday, weekend } = cell ?? {};
    for (const v of [weekday, weekend]) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        throw new ValidationError(`Row ${key} needs a non-negative weekday and weekend price.`);
      }
    }
    out[key] = { weekday, weekend };
  }
  if (Object.keys(out).length === 0) throw new ValidationError("Add at least one length.");
  return out;
}

export async function getDefaultPrices(): Promise<PriceTable> {
  const [row] = await db.select({ p: app.defaultPrices }).from(app).limit(1);
  return row?.p ?? DEFAULT_PRICE_TABLE;
}

export async function setDefaultPrices(table: PriceTable): Promise<void> {
  const parsed = normalizePriceTable(table);
  const actorId = await currentUserId();
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (!row) throw new ValidationError("App settings are not initialized.");
  await appSettingsEntity.update(row.publicId, { defaultPrices: parsed, updatedBy: actorId });
}
