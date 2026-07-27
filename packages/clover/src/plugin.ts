/**
 * Client-safe Clover plugin catalog metadata.
 * No secrets, no fetch — safe for Integrations UI and settings hubs.
 */
export const CLOVER_PLUGIN_ID = "clover" as const;

export const CLOVER_PLUGIN = {
  id: CLOVER_PLUGIN_ID,
  label: "Clover",
  description:
    "Connect a Clover merchant account (sandbox or production) for payments and catalog sync in later phases.",
} as const;
