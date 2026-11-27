// Browsers strip tabs and newlines from URLs, so "/\t/host" would become "//host".
const SAFE_PATH = /^\/(?![/\\])[^\\\s\x00-\x1f\x7f]*$/;

export function safeRedirect(path: unknown): string {
  // An encoded slash or backslash could be decoded into "//host" by a router downstream.
  return typeof path === "string" && SAFE_PATH.test(path) && !/%(2f|5c)/i.test(path) ? path : "/inquiries";
}
