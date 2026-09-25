const REACT_FRAMEWORK_ERROR_RE =
  /Minified React error|Server Components render|error-decoder\.html|invariant=\d+|NEXT_REDIRECT/i;

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

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

  if (REACT_FRAMEWORK_ERROR_RE.test(message)) {
    return fallback;
  }

  return message;
}
