import { z } from "zod";

export const googleReviewsConfigSchema = z.object({
  installed: z.boolean().default(false),
  /** Google Place ID of the business, e.g. "ChIJ…". Cacheable indefinitely. */
  placeId: z.string().optional(),
  provider: z.enum(["places", "business-profile"]).default("places"),
});
export type GoogleReviewsConfig = z.infer<typeof googleReviewsConfigSchema>;

export const DEFAULT_GOOGLE_REVIEWS_CONFIG: GoogleReviewsConfig = {
  installed: false,
  provider: "places",
};

/** NULL/garbage config → uninstalled. Never throws on read. */
export function parseGoogleReviewsConfig(raw: unknown): GoogleReviewsConfig {
  const parsed = googleReviewsConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_GOOGLE_REVIEWS_CONFIG;
}

/**
 * Server env only — the key is never stored in the DB and never reaches the
 * client. Mirrors OPTIMOROUTE_API_KEY: secrets in env, config in the blob.
 */
export function loadPlacesApiKeyFromEnv(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key ? key : null;
}
