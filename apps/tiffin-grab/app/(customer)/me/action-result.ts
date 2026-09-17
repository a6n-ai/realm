import { AppError } from "@foundry/commons";

/**
 * Shared return shape for customer-facing "use server" mutations that can be
 * rejected for an expected, user-facing reason (a cutoff passed, a slot is
 * already taken, ...).
 *
 * These must be RETURNED, never thrown: this Next.js build redacts any error
 * thrown across the Server Action boundary to a generic, message-less
 * "Minified React error #441" in production builds — see
 * node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md
 * ("model expected errors as return values"; throwing is reserved for
 * uncaught/unexpected bugs, which SHOULD stay opaque to the client). Dev mode
 * shows the real message either way, which is why this was invisible until
 * someone tested a production build.
 */
export type ActionResult = { ok: true } | { error: string };

/**
 * Runs `fn`, converting an expected `AppError` (ValidationError, NotFoundError,
 * ...) into `{ error }` so its message survives to the client in production.
 * Anything else still throws — a real bug should still hit Next's normal
 * uncaught-exception handling, not be silently swallowed as a toast.
 */
export async function runAction(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
