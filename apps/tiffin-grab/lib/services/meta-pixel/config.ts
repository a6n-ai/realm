import { z } from "zod";
import { open, seal } from "@foundry/commons/secret-box";
import { PIXEL_ID_RE, TEST_CODE_RE } from "./pixel-id";
import { getIntegrationsConfig, getIntegrationsConfigFresh, setIntegrationsConfig } from "@/lib/services/app-settings.service";

// App-local like OptimoRoute: rides in the z.loose() integrations_config blob, so no migration.
export const META_PIXEL_KEY = "metaPixel" as const;
const TOKEN_CONTEXT = "metaPixel.accessToken";


const envelopeSchema = z.object({ v: z.literal(1), iv: z.string(), tag: z.string(), ct: z.string() });

export const metaPixelConfigSchema = z.object({
  installed: z.boolean().default(false),
  pixelId: z.string().regex(PIXEL_ID_RE).nullable().default(null),
  /** Conversions API token, AES-GCM sealed with INTEGRATIONS_ENCRYPTION_KEY (same as Stripe keys). */
  accessToken: envelopeSchema.nullable().default(null),
  /** Events Manager → Test events code. Live events sent with it land in Test events, so clear it after testing. */
  testEventCode: z.string().regex(TEST_CODE_RE).nullable().default(null),
});
export type MetaPixelConfig = z.infer<typeof metaPixelConfigSchema>;

const DEFAULT_CONFIG: MetaPixelConfig = metaPixelConfigSchema.parse({});

export function parseMetaPixelConfig(raw: unknown): MetaPixelConfig {
  const parsed = metaPixelConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_CONFIG };
}

/** Cached read: safe for the public script and event sends, never for a read-modify-write. */
export async function getMetaPixelConfig(): Promise<MetaPixelConfig> {
  const cfg = await getIntegrationsConfig();
  return parseMetaPixelConfig((cfg as Record<string, unknown>)[META_PIXEL_KEY]);
}

export async function updateMetaPixelConfig(patch: Partial<MetaPixelConfig>): Promise<void> {
  const cfg = await getIntegrationsConfigFresh();
  const current = parseMetaPixelConfig((cfg as Record<string, unknown>)[META_PIXEL_KEY]);
  await setIntegrationsConfig({ ...cfg, [META_PIXEL_KEY]: metaPixelConfigSchema.parse({ ...current, ...patch }) });
}

export function encryptionKey(): string | null {
  return process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim() || null;
}

export function sealAccessToken(token: string, key: string) {
  return seal(token, key, TOKEN_CONTEXT);
}

/** Null when unset, the key is missing, or the key changed since it was sealed. */
export function openAccessToken(cfg: MetaPixelConfig): string | null {
  const key = encryptionKey();
  if (!cfg.accessToken || !key) return null;
  try {
    return open(cfg.accessToken, key, TOKEN_CONTEXT);
  } catch {
    return null;
  }
}

/** Safe for the admin UI: never carries the token. */
export type MetaPixelStatus = {
  installed: boolean;
  pixelId: string | null;
  hasToken: boolean;
  tokenReadable: boolean;
  testEventCode: string | null;
  hasEncryptionKey: boolean;
};

export async function getMetaPixelStatus(): Promise<MetaPixelStatus> {
  const cfg = await getMetaPixelConfig();
  return {
    installed: cfg.installed,
    pixelId: cfg.pixelId,
    hasToken: cfg.accessToken != null,
    tokenReadable: openAccessToken(cfg) != null,
    testEventCode: cfg.testEventCode,
    hasEncryptionKey: encryptionKey() != null,
  };
}
