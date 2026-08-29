export type PlaceSuggestion = {
  placeId: string;
  /** Display string for the dropdown. The cheap bucket returns exactly this. */
  label: string;
};

export type ResolvedPlace = {
  lat: number;
  lng: number;
  formattedAddress: string;
  addressLine?: string;
  city?: string;
  province?: string;
  postalCode?: string;
};

export type PlaceProvider = {
  id: "aws" | "google" | "nominatim";
  /** Typeahead. Cheapest bucket — id + text only, never persisted. */
  suggest(query: string, opts?: { near?: { lat: number; lng: number }; country?: string }): Promise<PlaceSuggestion[]>;
  /**
   * `persist: true` selects the storage-licensed bucket (AWS `intendedUse = Stored`),
   * ~8x the price of Core. Set it ONLY when the result is written to a database —
   * it is both the legal and the cost boundary.
   */
  resolve(input: { placeId?: string; address: string; persist: boolean }): Promise<ResolvedPlace | null>;
};
