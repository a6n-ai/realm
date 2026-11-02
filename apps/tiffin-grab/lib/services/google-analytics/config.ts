import { z } from "zod";
import { open, seal } from "@foundry/commons/secret-box";
import { getIntegrationsConfig, getIntegrationsConfigFresh, setIntegrationsConfig } from "@/lib/services/app-settings.service";
import { GA_ID_RE } from "./ids";

// App-local, same blob and rules as Meta Pixel (lib/services/meta-pixel/config.ts).
export const GA_KEY = "googleAnalytics" as const;
const SECRET_CONTEXT = "googleAnalytics.apiSecret";

const envelopeSchema = z.object({ v: z.literal(1), iv: z.string(), tag: z.string(), ct: z.string() });

export const gaConfigSchema = z.object({
  installed: z.boolean().default(false),
  measurementId: z.string().regex(GA_ID_RE).nullable().default(null),
  /** Measurement Protocol API secret, for server events. Sealed with INTEGRATIONS_ENCRYPTION_KEY. */
  apiSecret: envelopeSchema.nullable().default(null),
});
export type GaConfig = z.infer<typeof gaConfigSchema>;

const DEFAULT_CONFIG: GaConfig = gaConfigSchema.parse({});

function parse(raw: unknown): GaConfig {
  const parsed = gaConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_CONFIG };
}

/** Cached read: never use for a read-modify-write. */
export async function getGaConfig(): Promise<GaConfig> {
  const cfg = await getIntegrationsConfig();
  return parse((cfg as Record<string, unknown>)[GA_KEY]);
}

export async function updateGaConfig(patch: Partial<GaConfig>): Promise<void> {
  const cfg = await getIntegrationsConfigFresh();
  const current = parse((cfg as Record<string, unknown>)[GA_KEY]);
  await setIntegrationsConfig({ ...cfg, [GA_KEY]: gaConfigSchema.parse({ ...current, ...patch }) });
}

/** Legacy SSM value (/tiffin-grab/prod/GA_MEASUREMENT_ID): used only until the plugin is installed. */
export function envMeasurementId(): string | null {
  const id = process.env.GA_MEASUREMENT_ID?.trim();
  return id && GA_ID_RE.test(id) ? id : null;
}

/** The ID the site actually loads: the plugin's once installed, else the env fallback. */
export function effectiveMeasurementId(cfg: GaConfig): string | null {
  return cfg.installed ? cfg.measurementId : envMeasurementId();
}

export function sealApiSecret(secret: string, key: string) {
  return seal(secret, key, SECRET_CONTEXT);
}

export function openApiSecret(cfg: GaConfig): string | null {
  const key = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!cfg.apiSecret || !key) return null;
  try {
    return open(cfg.apiSecret, key, SECRET_CONTEXT);
  } catch {
    return null;
  }
}

export type GaStatus = {
  installed: boolean;
  measurementId: string | null;
  envMeasurementId: string | null;
  hasSecret: boolean;
  secretReadable: boolean;
  hasEncryptionKey: boolean;
};

export async function getGaStatus(): Promise<GaStatus> {
  const cfg = await getGaConfig();
  return {
    installed: cfg.installed,
    measurementId: cfg.measurementId,
    envMeasurementId: envMeasurementId(),
    hasSecret: cfg.apiSecret != null,
    secretReadable: openApiSecret(cfg) != null,
    hasEncryptionKey: Boolean(process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()),
  };
}
