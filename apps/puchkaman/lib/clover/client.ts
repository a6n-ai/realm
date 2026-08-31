import { createCloverClient as createFromStore } from "@foundry/clover";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

/**
 * App-bound Clover client — package factory + puchkaman integrations store.
 */
export function createCloverClient() {
  return createFromStore(integrationsConfigStore);
}
