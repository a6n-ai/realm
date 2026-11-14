/**
 * The one client-IP header the edge sets and a client cannot forge. Cloudflare is the only edge in
 * front of the app (Workers in production), and it overwrites cf-connecting-ip on every request.
 * x-real-ip is not trusted: nothing in front of the app sets it any more, so a client could send its own.
 */
export function trustedIpHeaders(): string[] {
  return ["cf-connecting-ip"];
}

/** The caller's IP from the trusted edge header only; null when the request did not come through the edge. */
export function requestIp(h: Headers): string | null {
  return trustedIpHeaders().map((k) => h.get(k)?.trim()).find(Boolean) ?? null;
}
