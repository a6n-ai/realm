import { AppError, AuthError, ForbiddenError } from "@foundry/commons";
import { MealRuleViolationError } from "@/lib/menu/meal-rule-error";

/**
 * Shared return shape for customer-facing "use server" mutations that can be
 * rejected for an expected, user-facing reason (a cutoff passed, a slot is
 * already taken, ...).
 *
 * These must be RETURNED, never thrown: this Next.js build redacts any error
 * thrown across the Server Action boundary to a generic, message-less
 * "Minified React error #441" in production builds.
 */
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true; message?: string } & T)
  | {
      error: string;
      /**
       * Set when a meal rule refused the change, so the picker can highlight
       * that rule in the list it already shows. Optional and additive — every
       * existing caller keeps reading `error` alone.
       */
      violatedRuleId?: string;
    };

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Runs `fn`, converting an expected `AppError` or unexpected error into `{ error }`. Success may
 * return void, a message string, or an object merged onto `{ ok: true }`.
 *
 * Overloads keep void/string callers as plain `ActionResult` — without them TS
 * widens the payload to `Record<string, unknown>` and the success branch stops
 * being assignable to the default `ActionResult` union (deploy typecheck fail).
 */
export async function runAction(
  fn: () => Promise<void | string>,
): Promise<ActionResult>;
export async function runAction<T extends Record<string, unknown>>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>>;
export async function runAction<T extends Record<string, unknown>>(
  fn: () => Promise<void | string | T>,
): Promise<ActionResult | ActionResult<T>> {
  try {
    const result = await fn();
    if (result == null) return { ok: true } as ActionResult;
    if (typeof result === "string") return { ok: true, message: result } as ActionResult;
    return { ok: true, ...result } as ActionResult<T>;
  } catch (e) {
    // Next.js redirect() throws a special error carrying NEXT_REDIRECT in digest.
    // That must be re-thrown so Next.js router can navigate.
    if (isRedirectError(e)) {
      throw e;
    }
    if (e instanceof MealRuleViolationError) {
      return { error: e.message, violatedRuleId: e.rulePublicId };
    }
    if (e instanceof AuthError) {
      return { error: e.message === "Unauthorized" ? "Session expired. Please log in again." : e.message };
    }
    if (e instanceof ForbiddenError) {
      return { error: e.message === "Forbidden" ? "You do not have permission to perform this action." : e.message };
    }
    if (e instanceof AppError) {
      return { error: e.message };
    }
    // Unexpected error (e.g. database error, file storage timeout, etc.).
    // Log the full error on the server for debugging, and return a clean error message
    // to prevent Next.js from redacting it to Minified React Error #441.
    console.error("[runAction unexpected error]", e);
    return { error: "Unable to complete request. Please try again." };
  }
}
