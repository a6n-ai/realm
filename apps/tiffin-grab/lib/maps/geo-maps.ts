import { awsMapProvider, type MapTileProvider } from "@foundry/maps";
import { createLogger } from "@foundry/commons/logger";

export const mapsLog = createLogger("geo-maps-proxy");

let provider: MapTileProvider | null = null;

/** Memoised per process; credentials come from static AWS_* env keys, never the browser. */
export function mapProvider(): MapTileProvider {
  return (provider ??= awsMapProvider({ region: process.env.AWS_REGION }));
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

/** AwsError carries a stable `code`; fall back to the error name for anything else. */
export function errorName(e: unknown): string | undefined {
  const err = e as { code?: string; name?: string } | null;
  return err?.code ?? err?.name;
}
