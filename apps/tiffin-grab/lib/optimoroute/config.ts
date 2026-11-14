import { z } from "zod";
import { integrationSlice } from "@foundry/commons/plugin-kit";
import { integrationsConfigReadStore, integrationsConfigStore } from "@/lib/payments/integrations-config";

// App-local, not @foundry/clover: OptimoRoute is delivery routing for this client, and
// nothing has proven it shared. It rides in the same integrations_config blob, which is
// z.loose() precisely so an app-local key survives another plugin's save.
const OPTIMOROUTE_KEY = "optimoroute" as const;

/**
 * Stop duration in minutes. Carried over from the Route Maker spreadsheet, where it is
 * real operational knowledge rather than a guess: downtown parking and stairs cost time,
 * and a route planned without that runs late by mid-afternoon.
 */
const optimoRouteDurationSchema = z.object({
  base: z.number().int().min(1).max(120).default(1),
  /** Cities that are slow to park in, lowercased. */
  slowCities: z.array(z.string()).default(["toronto"]),
  slowCity: z.number().int().min(1).max(120).default(2),
  upstairs: z.number().int().min(1).max(120).default(5),
  slowCityUpstairs: z.number().int().min(1).max(120).default(7),
  /** Minutes added per tiffin beyond one per person: a trip carrying several days is more to hand over. */
  perExtraTiffin: z.number().int().min(0).max(30).default(1),
});
export type OptimoRouteDuration = z.infer<typeof optimoRouteDurationSchema>;

const DEFAULT_DURATION: OptimoRouteDuration = optimoRouteDurationSchema.parse({});

const optimoRouteConfigSchema = z.object({
  installed: z.boolean().default(false),
  /**
   * Send the tiffin count as load1. OFF until the owner confirms the (shared) OptimoRoute
   * account has load/capacity enabled — an unexpected load field could change routing.
   */
  sendLoad: z.boolean().default(false),
  duration: optimoRouteDurationSchema.default(DEFAULT_DURATION),
  /**
   * Display code per driverSerial, e.g. { "driver-4": "D4" }. Optional: the labels fall
   * back to driverName. Deliberately NOT derived from the driver's name — OptimoRoute
   * auto-names nothing, so "Driver 4" is a hand-typed string that can be renamed at any
   * time, silently re-sorting every label.
   */
  driverCodes: z.record(z.string(), z.string()).default({}),
  /**
   * Local (app timezone) hours the get_events poller runs. Outside them nothing is polled,
   * so the DB and OptimoRoute stay quiet overnight. "HH:MM", start < end.
   */
  eventsWindow: z
    .object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })
    .default({ start: "07:00", end: "23:00" }),
});
export const optimoRouteSlice = integrationSlice(OPTIMOROUTE_KEY, optimoRouteConfigSchema, {
  store: integrationsConfigStore,
  readStore: integrationsConfigReadStore,
});
export const getOptimoRouteConfig = optimoRouteSlice.get;
export const updateOptimoRouteConfig = optimoRouteSlice.update;

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
  sendLoad: boolean;
  hasApiKey: boolean;
  duration: OptimoRouteDuration;
};

export async function getOptimoRouteStatus(): Promise<OptimoRouteStatus> {
  const cfg = await getOptimoRouteConfig();
  return { installed: cfg.installed, sendLoad: cfg.sendLoad, hasApiKey: optimoRouteApiKey() != null, duration: cfg.duration };
}

export function stopDuration(
  d: OptimoRouteDuration,
  input: { city: string | null; upstairs: boolean; extraTiffins?: number },
): number {
  return baseDuration(d, input) + Math.max(0, input.extraTiffins ?? 0) * d.perExtraTiffin;
}

function baseDuration(d: OptimoRouteDuration, input: { city: string | null; upstairs: boolean }): number {
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
