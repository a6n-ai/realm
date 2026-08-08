/**
 * Client-safe Google Reviews plugin catalog metadata.
 * No secrets, no fetch — safe for Integrations UI and settings hubs.
 */
export const GOOGLE_REVIEWS_PLUGIN_ID = "googleReviews" as const;

export const GOOGLE_REVIEWS_PLUGIN = {
  id: GOOGLE_REVIEWS_PLUGIN_ID,
  label: "Google Reviews",
  description:
    "Show real Google ratings and reviews on the public site, and invite customers to leave one.",
} as const;
