import { z } from "zod";
import { getIntegrationsConfig, setIntegrationsConfig } from "@/lib/services/app-settings.service";

// App-local, not @foundry/clover: OptimoRoute is delivery routing for this client, and
// nothing has proven it shared. It rides in the same integrations_config blob, which is
// z.loose() precisely so an app-local key survives another plugin's save.
export const OPTIMOROUTE_KEY = "optimoroute" as const;

/**
 * Stop duration in minutes. Carried over from the Route Maker spreadsheet, where it is
 * real operational knowledge rather than a guess: downtown parking and stairs cost time,
 * and a route planned without that runs late by mid-afternoon.
 */
export const optimoRouteDurationSchema = z.object({
  /** Anything not matched below. */
  base: z.number().int().min(1).max(120).default(1),
  /** Cities that are slow to park in, lowercased. */
  slowCities: z.array(z.string()).default(["toronto"]),
  slowCity: z.number().int().min(1).max(120).default(2),
  upstairs: z.number().int().min(1).max(120).default(5),
  slowCityUpstairs: z.number().int().min(1).max(120).default(7),
});
export type OptimoRouteDuration = z.infer<typeof optimoRouteDurationSchema>;

const DEFAULT_DURATION: OptimoRouteDuration = optimoRouteDurationSchema.parse({});

export const optimoRouteConfigSchema = z.object({
  installed: z.boolean().default(false),
  duration: optimoRouteDurationSchema.default(DEFAULT_DURATION),
  /**
   * Display code per driverSerial, e.g. { "driver-4": "D4" }. Optional: the labels fall
   * back to driverName. Deliberately NOT derived from the driver's name — OptimoRoute
   * auto-names nothing, so "Driver 4" is a hand-typed string that can be renamed at any
   * time, silently re-sorting every label.
   */
  driverCodes: z.record(z.string(), z.string()).default({}),
});
export type OptimoRouteConfig = z.infer<typeof optimoRouteConfigSchema>;

export const DEFAULT_OPTIMOROUTE_CONFIG: OptimoRouteConfig = optimoRouteConfigSchema.parse({});

export function parseOptimoRouteConfig(raw: unknown): OptimoRouteConfig {
  const parsed = optimoRouteConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_OPTIMOROUTE_CONFIG };
}

export async function getOptimoRouteConfig(): Promise<OptimoRouteConfig> {
  const cfg = await getIntegrationsConfig();
  return parseOptimoRouteConfig((cfg as Record<string, unknown>)[OPTIMOROUTE_KEY]);
}

export async function setOptimoRouteConfig(next: OptimoRouteConfig): Promise<void> {
  const cfg = await getIntegrationsConfig();
  await setIntegrationsConfig({ ...cfg, [OPTIMOROUTE_KEY]: optimoRouteConfigSchema.parse(next) });
}

/**
 * The API key is a server-only env var, never a column and never in the config blob — the
 * same rule CLOVER_APP_SECRET follows. It can create and delete real delivery orders, so
 * it must not be reachable from a client bundle or an admin JSON payload.
 */
export function optimoRouteApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.OPTIMOROUTE_API_KEY?.trim() || null;
}

/** Safe for the admin UI: says whether a key exists, never what it is. */
export type OptimoRouteStatus = {
  installed: boolean;
  hasApiKey: boolean;
  duration: OptimoRouteDuration;
};

export async function getOptimoRouteStatus(): Promise<OptimoRouteStatus> {
  const cfg = await getOptimoRouteConfig();
  return { installed: cfg.installed, hasApiKey: optimoRouteApiKey() != null, duration: cfg.duration };
}

/** Minutes for one stop, from the city + whether the drop is upstairs. */
export function stopDuration(
  d: OptimoRouteDuration,
  input: { city: string | null; upstairs: boolean },
): number {
  const slow = d.slowCities.includes((input.city ?? "").trim().toLowerCase());
  if (slow && input.upstairs) return d.slowCityUpstairs;
  if (slow) return d.slowCity;
  if (input.upstairs) return d.upstairs;
  return d.base;
}

/** The spreadsheet's own signal: "upstairs delivery" written into the free-text note. */
export function looksUpstairs(notes: string | null | undefined): boolean {
  return /upstairs/i.test(notes ?? "");
}
