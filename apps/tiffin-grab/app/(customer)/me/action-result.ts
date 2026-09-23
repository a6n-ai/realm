import { AppError } from "@foundry/commons";
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

/**
 * Runs `fn`, converting an expected `AppError` into `{ error }`. Success may
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
    if (e instanceof MealRuleViolationError) return { error: e.message, violatedRuleId: e.rulePublicId };
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
