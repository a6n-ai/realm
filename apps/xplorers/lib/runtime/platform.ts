import { isWorkers } from "@foundry/commons/runtime/platform";

/**
 * The one client-IP header this runtime's edge sets and a client cannot forge.
 * Never trust both: behind Caddy a client can send its own cf-connecting-ip.
 */
export function trustedIpHeaders(): string[] {
  return isWorkers() ? ["cf-connecting-ip"] : ["x-real-ip"];
}
