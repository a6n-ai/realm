import {
  GeoPlacesClient,
  AutocompleteCommand,
  GeocodeCommand,
  GetPlaceCommand,
  type AutocompleteCommandOutput,
  type GeocodeCommandOutput,
  type GetPlaceCommandOutput,
} from "@aws-sdk/client-geo-places";
import type { PlaceProvider, PlaceSuggestion, ResolvedPlace } from "./types";

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

/** AWS Position is [longitude, latitude] — GeoJSON order, not { lat, lng }. */
function toResolvedPlace(position: readonly number[] | undefined, label: string | undefined): ResolvedPlace | null {
  if (!position || position.length < 2 || !label) return null;
  const [lng, lat] = position;
  return { lat, lng, formattedAddress: label };
}

export function awsPlaceProvider(opts: AwsPlaceProviderOptions = {}): PlaceProvider {
  const client: GeoPlacesSendClient = opts.client ?? new GeoPlacesClient({ region: opts.region });

  return {
    id: "aws",

    async suggest(query, suggestOpts) {
      try {
        // No AdditionalFeatures, no IntendedUse — this is the $0.20/1k Label bucket.
        const out = await client.send(
          new AutocompleteCommand({
            QueryText: query,
            BiasPosition: suggestOpts?.near ? [suggestOpts.near.lng, suggestOpts.near.lat] : undefined,
            Filter: suggestOpts?.country ? { IncludeCountries: [suggestOpts.country] } : undefined,
          }),
        );
        const items = out.ResultItems ?? [];
        const suggestions: PlaceSuggestion[] = [];
        for (const item of items) {
          if (item.PlaceId && item.Title) suggestions.push({ placeId: item.PlaceId, label: item.Title });
        }
        return suggestions;
      } catch {
        return [];
      }
    },

    async resolve({ placeId, address, persist }) {
      // "Storage" is the SDK's actual enum value for the Stored/persistable bucket
      // (the brief called it "Stored"; the installed SDK names it "Storage").
      const intendedUse = persist ? "Storage" : undefined;
      try {
        if (placeId) {
          const out = await client.send(new GetPlaceCommand({ PlaceId: placeId, IntendedUse: intendedUse }));
          return toResolvedPlace(out.Position, out.Address?.Label);
        }
        const out = await client.send(new GeocodeCommand({ QueryText: address, IntendedUse: intendedUse }));
        const item = out.ResultItems?.[0];
        if (!item) return null;
        return toResolvedPlace(item.Position, item.Address?.Label);
      } catch {
        return null;
      }
    },
  };
}
