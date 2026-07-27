import {
  parseIntegrationsConfig,
  type IntegrationsConfig,
  type IntegrationsConfigStore,
} from "@realm/clover";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { app } from "@/db/schema";

/**
 * Single-row integrations blob on `app` — same persistence shape as
 * tiffin-grab's payment_config (JSONB on the tenant singleton).
 */
export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  const [row] = await db.select({ cfg: app.integrationsConfig }).from(app).limit(1);
  return parseIntegrationsConfig(row?.cfg ?? undefined);
}

export async function setIntegrationsConfig(cfg: IntegrationsConfig): Promise<void> {
  const parsed = parseIntegrationsConfig(cfg);
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) {
    await db
      .update(app)
      .set({ integrationsConfig: parsed, updatedAt: Date.now() })
      .where(eq(app.publicId, row.publicId));
  } else {
    await db.insert(app).values({ integrationsConfig: parsed });
  }
}

export const integrationsConfigStore: IntegrationsConfigStore = {
  get: getIntegrationsConfig,
  set: setIntegrationsConfig,
};
