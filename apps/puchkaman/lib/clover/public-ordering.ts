import { createCloverClient } from "@/lib/clover/client";

export { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";

/**
 * Public website ordering is ready only when a Clover API client can be built —
 * either static merchant credentials (`CLOVER_MERCHANT_ID` /
 * `CLOVER_MERCHANT_API_TOKEN` / `CLOVER_ECOMMERCE_*`, generated directly from
 * the merchant Dashboard) or, failing that, the OAuth app-install path (env
 * app credentials `CLOVER_APP_ID` / `CLOVER_APP_SECRET` + a connected
 * merchant with tokens). See `createCloverClient` (`@realm/clover`) for which
 * one actually gets tried.
 *
 * Stronger than inventory SoT (`isCloverInventoryConnected` = connected + merchantId
 * only). There is no persisted ecommerce/PAKMS flag — checkout still live-checks
 * `getPakmsApiKey()` after this gate.
 */
export async function isPublicOrderingEnabled(): Promise<boolean> {
  const client = await createCloverClient();
  return client !== null;
}
