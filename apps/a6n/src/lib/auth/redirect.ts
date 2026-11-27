// Browsers strip tabs and newlines from URLs, so "/\t/host" would become "//host".
const SAFE_PATH = /^\/(?![/\\])[^\\\s\x00-\x1f\x7f]*$/;

export function safeRedirect(path: unknown): string {
  return typeof path === "string" && SAFE_PATH.test(path) ? path : "/inquiries";
}
