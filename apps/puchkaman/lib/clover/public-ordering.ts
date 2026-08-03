import { getCloverConnection, isCloverEcommerceConfigured } from "@realm/clover";
import { createCloverClient } from "@/lib/clover/client";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";

/**
 * Public website ordering needs two things, not one: a Clover API client, and a
 * connection that can actually reach the Ecommerce API.
 *
 * A buildable client is not enough. In API-token mode the Ecommerce credentials
 * are entered separately and are optional — catalog and employee sync work
 * without them, checkout cannot. Gating on the client alone advertised a cart
 * and a checkout that were guaranteed to fail at `getPakmsApiKey()`.
 *
 * Stronger than inventory SoT (`isCloverInventoryConnected` = connected +
 * merchantId only).
 */
export async function isPublicOrderingEnabled(): Promise<boolean> {
  const [client, connection] = await Promise.all([
    createCloverClient(),
    getCloverConnection(integrationsConfigStore),
  ]);
  return client !== null && isCloverEcommerceConfigured(connection);
}
