import { createCloverClient } from "@/lib/clover/client";

export { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";

/**
 * Public website ordering is ready only when a Clover API client can be built —
 * either a merchant connected with API tokens (Settings → Clover) or the OAuth
 * app-install path (`CLOVER_APP_ID` / `CLOVER_APP_SECRET` + a connected merchant
 * with tokens). See `createCloverClient` (`@realm/clover`).
 *
 * Stronger than inventory SoT (`isCloverInventoryConnected` = connected + merchantId
 * only), but still not a guarantee: in API-token mode the Ecommerce credentials are
 * optional, so checkout live-checks `getPakmsApiKey()` after this gate.
 */
export async function isPublicOrderingEnabled(): Promise<boolean> {
  const client = await createCloverClient();
  return client !== null;
}
