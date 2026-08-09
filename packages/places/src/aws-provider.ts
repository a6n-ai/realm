import {
  GeoPlacesClient,
  AutocompleteCommand,
  GeocodeCommand,
  GetPlaceCommand,
  type AutocompleteCommandOutput,
  type GeocodeCommandOutput,
  type GetPlaceCommandOutput,
} from "@aws-sdk/client-geo-places";
import { createLogger } from "@realm/commons/logger";
import type { PlaceProvider, PlaceSuggestion, ResolvedPlace } from "./types";

const log = createLogger("places-aws");

/** Minimal slice of GeoPlacesClient we use — lets tests inject a fake. */
export interface GeoPlacesSendClient {
  send(command: AutocompleteCommand): Promise<AutocompleteCommandOutput>;
  send(command: GeocodeCommand): Promise<GeocodeCommandOutput>;
  send(command: GetPlaceCommand): Promise<GetPlaceCommandOutput>;
}

export interface AwsPlaceProviderOptions {
  /** AWS region, e.g. "us-east-1". Ignored when a client is injected. */
  region?: string;
  /** Inject for tests; otherwise a real GeoPlacesClient is built (default credential chain). */
  client?: GeoPlacesSendClient;
}

const CONNECTION_TIMEOUT_MS = 2_000;

// Real clients are built once per (kind, region) and reused — a long-lived Next.js
// server would otherwise re-resolve credentials and open a fresh socket pool on
// every awsPlaceProvider() call. Keyed by kind because suggest and resolve
// deliberately run different retry/timeout budgets (see below).
const clientCache = new Map<string, GeoPlacesClient>();

function getSharedClient(kind: "suggest" | "resolve", region: string | undefined): GeoPlacesClient {
  const key = `${kind}:${region ?? ""}`;
  let client = clientCache.get(key);
  if (!client) {
    client =
      kind === "suggest"
        ? // Fires on every keystroke of a debounced typeahead — the user has often
          // already typed past this request by the time a retry would land, so fail
          // fast rather than tripling cost/latency on stale input.
          new GeoPlacesClient({
            region,
            maxAttempts: 1,
            requestHandler: { connectionTimeout: CONNECTION_TIMEOUT_MS, requestTimeout: 3_000 },
          })
        : // Runs once per order — worth the SDK's default retry budget, with a longer
          // timeout since checkout can afford to wait slightly longer than a keystroke.
          new GeoPlacesClient({
            region,
            maxAttempts: 3,
            requestHandler: { connectionTimeout: CONNECTION_TIMEOUT_MS, requestTimeout: 8_000 },
          });
    clientCache.set(key, client);
  }
  return client;
}

/** AWS Position is [longitude, latitude] — GeoJSON order, not { lat, lng }. */
function toResolvedPlace(position: readonly number[] | undefined, label: string | undefined): ResolvedPlace | null {
  if (!position || position.length < 2 || !label) return null;
  const [lng, lat] = position;
  return { lat, lng, formattedAddress: label };
}

// A silent catch here is a silent outage: resolvePlace() falls through to
// Nominatim on any miss, so a bad IAM policy or wrong region would otherwise
// degrade every request with nothing to notice — no throw, no failed build, the
// AWS bill just stays at zero forever. Logging name + HTTP status is enough to
// diagnose auth vs. throttling vs. network without changing the never-throw contract.
function logAwsError(operation: string, e: unknown) {
  const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } } | undefined;
  // "errorName" (not "name") — pino already binds "name" to the logger name above;
  // reusing the key would silently shadow it in the JSON output.
  log.error(
    { errorName: err?.name, status: err?.$metadata?.httpStatusCode, err: err?.message ?? e },
    `${operation} request failed`,
  );
}

export function awsPlaceProvider(opts: AwsPlaceProviderOptions = {}): PlaceProvider {
  const suggestClient: GeoPlacesSendClient = opts.client ?? getSharedClient("suggest", opts.region);
  const resolveClient: GeoPlacesSendClient = opts.client ?? getSharedClient("resolve", opts.region);

  return {
    id: "aws",

    async suggest(query, suggestOpts) {
      if (!query.trim()) return [];
      try {
        // No AdditionalFeatures, no IntendedUse — this is the $0.20/1k Label bucket.
        const out = await suggestClient.send(
          new AutocompleteCommand({
            QueryText: query,
            BiasPosition: suggestOpts?.near ? [suggestOpts.near.lng, suggestOpts.near.lat] : undefined,
            Filter: suggestOpts?.country ? { IncludeCountries: [suggestOpts.country] } : undefined,
          }),
        );
        const items = out.ResultItems ?? [];
        const suggestions: PlaceSuggestion[] = [];
        for (const item of items) {
          // Address.Label, not Title. Title is ordered least-specific first
          // ("Canada, ON, M1L 1B8, Toronto, Oakridge, 3315 Danforth Ave"),
          // which puts the street at the end of every row in the dropdown.
          // Address.Label reads the way a customer expects
          // ("3315 Danforth Ave, Scarborough, ON M1L 1B8, Canada") and is
          // returned by default — no AdditionalFeatures, so this stays in the
          // cheap Label bucket rather than moving to Core.
          const label = item.Address?.Label ?? item.Title;
          if (item.PlaceId && label) suggestions.push({ placeId: item.PlaceId, label });
        }
        return suggestions;
      } catch (e) {
        logAwsError("autocomplete", e);
        return [];
      }
    },

    async resolve({ placeId, address, persist }) {
      if (!placeId && !address.trim()) return null;

      // "Storage" is the SDK's actual enum value for the Stored/persistable bucket
      // (the brief called it "Stored"; the installed SDK names it "Storage").
      const intendedUse = persist ? "Storage" : undefined;
      try {
        if (placeId) {
          const out = await resolveClient.send(new GetPlaceCommand({ PlaceId: placeId, IntendedUse: intendedUse }));
          return toResolvedPlace(out.Position, out.Address?.Label);
        }
        const out = await resolveClient.send(new GeocodeCommand({ QueryText: address, IntendedUse: intendedUse }));
        const item = out.ResultItems?.[0];
        if (!item) return null;
        return toResolvedPlace(item.Position, item.Address?.Label);
      } catch (e) {
        logAwsError(placeId ? "get-place" : "geocode", e);
        return null;
      }
    },
  };
}
