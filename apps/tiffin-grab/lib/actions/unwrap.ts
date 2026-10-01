import type { ActionResult } from "@/app/(customer)/me/action-result";
import { promptReloadIfStale } from "@/components/stale-deploy-reloader";

/**
 * Server actions return `{ error }` instead of throwing (production redacts thrown errors).
 * Shared hooks like @foundry/address's useAddressBook expect a throw, so client callers
 * unwrap: a refusal becomes an Error with the real message; success drops the `ok` flag.
 */
export async function unwrapAction<T extends Record<string, unknown> = Record<string, never>>(
  result: Promise<ActionResult<T>>,
): Promise<T> {
  let r: ActionResult<T>;
  try {
    r = await result;
  } catch (e) {
    // A tab built before the last deploy: prompt a reload instead of surfacing Next's raw message.
    if (promptReloadIfStale(e)) throw new Error("A new version of the app is available. Reload the page and try again.");
    throw e;
  }
  if ("error" in r) throw new Error(String(r.error));
  const { ok: _ok, ...rest } = r;
  return rest as unknown as T;
}
