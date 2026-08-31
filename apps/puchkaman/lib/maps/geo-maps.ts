import { GeoMapsClient } from "@aws-sdk/client-geo-maps";
import { createLogger } from "@foundry/commons/logger";

export const mapsLog = createLogger("geo-maps-proxy");

/** Amazon Location's Standard basemap, light scheme — matches the CRM surface. */
export const MAP_STYLE = "Standard" as const;
export const MAP_COLOR_SCHEME = "Light" as const;
export const MAP_TILESET = "vector.basemap";

let client: GeoMapsClient | null = null;

/**
 * Memoised per process. Credentials come from the default provider chain (the
 * instance role in prod), the same as SESv2Client and the places provider — no
 * key is ever constructed here, and none reaches the browser.
 */
export function geoMapsClient(): GeoMapsClient {
  if (!client) {
    client = new GeoMapsClient({
      region: process.env.AWS_REGION,
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 2_000, requestTimeout: 6_000 },
    });
  }
  return client;
}

/**
 * Map assets are immutable for a given URL — AWS versions the sprite path and
 * tiles are content-addressed by z/x/y — so they cache hard. This is what keeps
 * the proxy cheap: most requests never reach AWS at all.
 */
export const MAP_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

export function bodyToResponse(
  bytes: Uint8Array,
  contentType: string | undefined,
  fallbackType: string,
): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": contentType ?? fallbackType,
      "cache-control": MAP_CACHE_CONTROL,
    },
  });
}
