import { ValidationError } from "@foundry/commons";
import { parsePaymentConfig, type PaymentConfig } from "@foundry/payments";
import { mergePaymentCatalog } from "@foundry/payments/providers";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { app } from "@/db/schema";
import { CURRENCIES, isIanaTimeZone } from "@/lib/app-clock";
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
