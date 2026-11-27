import { AuthError, ForbiddenError } from "@foundry/commons";
import { createBoundary } from "@foundry/commons/guard";
import { MealRuleViolationError } from "@/lib/errors";

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
       * that rule in the list it already shows.
       */
      violatedRuleId?: string;
      /** The AppError's HTTP-style status, so a caller can branch on a conflict (409) without matching text. */
      status?: number;
      /** Machine-readable reason a caller can branch on instead of matching `error` text. */
      errorCode?: string;
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

// Next.js redirect() throws a NEXT_REDIRECT error the router must see, so it passes through.
// Unexpected errors get a clean message: a thrown one would be redacted to Minified React Error #441.
const boundary = createBoundary({
  rethrow: isRedirectError,
  internalMessage: "Unable to complete request. Please try again.",
  onFailure: (_sent, status, cause) => {
    if (status === 500) console.error("[runAction unexpected error]", cause);
  },
  details: (e) => {
    if (e instanceof MealRuleViolationError) return { violatedRuleId: e.rulePublicId };
    if (e instanceof AuthError && e.message === "Unauthorized") return { error: "Session expired. Please log in again." };
    if (e instanceof ForbiddenError && e.message === "Forbidden") {
      return { error: "You do not have permission to perform this action." };
    }
    const errorCode = (e as { errorCode?: unknown }).errorCode;
    return typeof errorCode === "string" ? { errorCode } : {};
  },
});

/**
 * Runs `fn`, converting an expected `AppError` or unexpected error into `{ error }`. Success may
 * return void, a message string, or an object merged onto `{ ok: true }`.
 *
 * Overloads keep void/string callers as plain `ActionResult` — without them TS
 * widens the payload to `Record<string, unknown>` and the success branch stops
 * being assignable to the default `ActionResult` union (deploy typecheck fail).
 */
export async function runAction(fn: () => Promise<void | string>): Promise<ActionResult>;
export async function runAction<T extends Record<string, unknown>>(fn: () => Promise<T>): Promise<ActionResult<T>>;
export async function runAction<T extends Record<string, unknown>>(
  fn: () => Promise<void | string | T>,
): Promise<ActionResult | ActionResult<T>> {
  const r = await boundary.result(fn);
  if (!r.ok) return r;
  const result = r.value;
  if (result == null) return { ok: true } as ActionResult;
  if (typeof result === "string") return { ok: true, message: result } as ActionResult;
  return { ok: true, ...result } as ActionResult<T>;
}
