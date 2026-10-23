// Mirrors the Worker's fail-closed floor on the shared secret.
const MIN_SECRET = 32;

/** Read at call time. Null means no Worker: SSE fallback + in-process bus. */
export function realtimeConfig(): { url: string; secret: string } | null {
  const url = process.env.REALTIME_URL;
  const secret = process.env.REALTIME_SECRET;
  return url && secret && secret.length >= MIN_SECRET ? { url, secret } : null;
}
