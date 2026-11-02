/** True inside a Cloudflare Worker (OpenNext); false on Node (EC2, dev, vitest). */
export function isWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}
