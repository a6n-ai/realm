import { ValidationError } from "@foundry/commons";
import { parsePaymentConfig, type PaymentConfig } from "@foundry/payments";
import { PAYMENT_PROVIDERS } from "@foundry/payments/providers";
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

/** Catalog methods (e-Transfer, cash, manual) always exist as tabs. Enablement is per-method. */
export async function ensurePaymentCatalog(): Promise<PaymentConfig> {
  const cfg = await getPaymentConfig();
  const have = new Set(cfg.methods.map((m) => m.id));
  const missing = PAYMENT_PROVIDERS.filter((p) => !have.has(p.id)).map((p) => p.seed());
  if (missing.length === 0) return cfg;
  const next = { ...cfg, methods: [...cfg.methods, ...missing] };
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
