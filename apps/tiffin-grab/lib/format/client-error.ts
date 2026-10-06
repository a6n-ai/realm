const REACT_FRAMEWORK_ERROR_RE =
  /Minified React error|Server Components render|error-decoder\.html|invariant=\d+|NEXT_REDIRECT/i;

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

// A page loaded before a deploy calls server action ids the new build no longer has.
// Retrying never helps; only a reload does.
const STALE_ACTION_RE = /Server Action .* was not found on the server|failed-to-find-server-action/i;
const BODY_TOO_LARGE_RE = /Body exceeded .* limit/i;

/**
 * Sanitizes an error caught on the client side (e.g. in button handlers, form submits,
 * or Server Action calls) so that raw Next.js/React framework errors (like minified #441)
 * are never exposed to users in the UI.
 */
export function sanitizeClientError(e: unknown, fallback: string = DEFAULT_FALLBACK): string {
  if (!e) return fallback;

  let message = "";
  if (typeof e === "string") {
    message = e.trim();
  } else if (e instanceof Error) {
    message = e.message.trim();
  } else if (typeof e === "object" && e !== null && "error" in e && typeof (e as { error: unknown }).error === "string") {
    message = ((e as { error: string }).error ?? "").trim();
  }

  if (!message) return fallback;

  if (STALE_ACTION_RE.test(message)) return "The app was just updated. Reload the page and try again.";
  if (BODY_TOO_LARGE_RE.test(message)) return "That file is too big to upload. Try a smaller screenshot.";

  if (REACT_FRAMEWORK_ERROR_RE.test(message)) {
    return fallback;
  }

  return message;
}
