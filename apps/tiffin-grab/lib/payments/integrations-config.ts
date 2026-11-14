import { parseIntegrationsConfig, type IntegrationsConfig, type IntegrationsConfigStore } from "@foundry/clover";
import { sql } from "drizzle-orm";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

/** Non-payment plugins (Clover, …) — same JSONB singleton pattern as payment_config. */
export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  return settingsCache.getOrSet("integrationsConfig", async () => {
    const [row] = await db.select({ cfg: app.integrationsConfig }).from(app).limit(1);
    return parseIntegrationsConfig(row?.cfg ?? undefined);
  });
}

// Uncached: Stripe writers are read-modify-write; a stale blob would resurrect wiped keys.
export async function getIntegrationsConfigFresh(): Promise<IntegrationsConfig> {
  const [row] = await db.select({ cfg: app.integrationsConfig }).from(app).limit(1);
  return parseIntegrationsConfig(row?.cfg ?? undefined);
}

export async function setIntegrationsConfig(cfg: IntegrationsConfig): Promise<void> {
  const parsed = parseIntegrationsConfig(cfg);
  await saveSetting({ integrationsConfig: parsed });
}

// Atomic single-key write: the webhook must not read-modify-write the whole blob
// (would race admin saves and could resurrect keys wiped by Disconnect).
export async function touchStripeLastEventAt(at: number): Promise<void> {
  await db.update(app).set({
    integrationsConfig: sql`jsonb_set(${app.integrationsConfig}, '{stripe,lastEventAt}', to_jsonb(${at}::bigint), true)`,
  }).where(sql`${app.integrationsConfig} ? 'stripe'`);
  await settingsCache.evictAll();
}

// Plugin WRITERS (clover, google-reviews, install/uninstall...) read-modify-write the whole
// blob, so their read must be uncached or a stale copy resurrects keys wiped on another instance.
export const integrationsConfigStore: IntegrationsConfigStore = {
  get: getIntegrationsConfigFresh,
  set: setIntegrationsConfig,
};

/** Display-only: cached get. Never pass to a writer. */
export const integrationsConfigReadStore: IntegrationsConfigStore = {
  get: getIntegrationsConfig,
  set: setIntegrationsConfig,
};
