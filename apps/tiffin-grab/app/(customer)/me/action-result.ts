import { AppError } from "@foundry/commons";

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
  | { error: string };

/**
 * Runs `fn`, converting an expected `AppError` into `{ error }`. Success may
 * return void, a message string, or an object merged onto `{ ok: true }`.
 */
export async function runAction<T extends Record<string, unknown> = Record<string, never>>(
  fn: () => Promise<void | string | T>,
): Promise<ActionResult<T>> {
  try {
    const result = await fn();
    if (result == null) return { ok: true } as ActionResult<T>;
    if (typeof result === "string") return { ok: true, message: result } as ActionResult<T>;
    return { ok: true, ...result } as ActionResult<T>;
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
