// Same trusted header better-auth is configured to read: Caddy overwrites
// x-real-ip with the socket peer. The leftmost x-forwarded-for token is
// client-controlled (Caddy appends to it), so trusting it would let a caller
// pick its own rate-limit bucket / fraud-scoring IP.
export function clientIp(request: Request): string | undefined {
  return request.headers.get("x-real-ip")?.trim() || undefined;
}
