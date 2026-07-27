import { createCloverClient } from "@/lib/clover/client";

export { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";

/**
 * Public website ordering is ready only when a Clover API client can be built:
 * env app credentials (`CLOVER_APP_ID` / `CLOVER_APP_SECRET`) + OAuth merchant
 * connection (`connected` + `merchantId` + tokens).
 *
 * Stronger than inventory SoT (`isCloverInventoryConnected` = connected + merchantId
 * only). There is no persisted ecommerce/PAKMS flag — checkout still live-checks
 * `getPakmsApiKey()` after this gate.
 */
export async function isPublicOrderingEnabled(): Promise<boolean> {
  const client = await createCloverClient();
  return client !== null;
}
