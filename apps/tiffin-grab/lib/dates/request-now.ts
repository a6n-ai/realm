import "server-only";

/** The request clock for server components and server code; the one sanctioned inline `Date.now()`. */
export function requestNow(): number {
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  return Date.now();
}
