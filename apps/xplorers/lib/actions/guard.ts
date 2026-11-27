import { NotFoundError, ValidationError } from "@foundry/commons";
import { createBoundary } from "@foundry/commons/guard";
import { unstable_rethrow } from "next/navigation";

// Production Next redacts anything an action throws, so user-facing failures come back as values.
// Everything else (auth refusals, NEXT_REDIRECT, NEXT_NOT_FOUND, bugs) rethrows untouched.
const boundary = createBoundary({ rethrow: (err) => !(err instanceof ValidationError || err instanceof NotFoundError) });

type Outcome<T> = { error: string } | { value: T };

/**
 * Runs `fn`; a ValidationError/NotFoundError becomes `{ error }`.
 * With `fallback`, any other failure is logged and becomes `{ error: fallback }`; Next's redirect/notFound still rethrow.
 */
export async function attempt<T>(fn: () => Promise<T>, fallback?: string): Promise<Outcome<T>> {
  try {
    const r = await boundary.result(fn);
    return r.ok ? { value: r.value } : { error: r.error };
  } catch (e) {
    if (fallback === undefined) throw e;
    unstable_rethrow(e);
    console.error(e);
    return { error: fallback };
  }
}
