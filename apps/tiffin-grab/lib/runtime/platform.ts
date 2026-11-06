/** True inside a Cloudflare Worker (OpenNext); false on Node (EC2, dev, vitest). */
export function isWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/**
 * The one client-IP header the edge sets and a client cannot forge. Cloudflare is the only edge in
 * front of the app (Workers in production), and it overwrites cf-connecting-ip on every request.
 * x-real-ip is not trusted: nothing in front of the app sets it any more, so a client could send its own.
 */
export function trustedIpHeaders(): string[] {
  return ["cf-connecting-ip"];
}
