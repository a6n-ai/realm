import type { ActionResult } from "@/app/(customer)/me/action-result";

/**
 * Server actions return `{ error }` instead of throwing (production redacts thrown errors).
 * Shared hooks like @foundry/address's useAddressBook expect a throw, so client callers
 * unwrap: a refusal becomes an Error with the real message; success drops the `ok` flag.
 */
export async function unwrapAction<T extends Record<string, unknown> = Record<string, never>>(
  result: Promise<ActionResult<T>>,
): Promise<T> {
  const r = await result;
  if ("error" in r) throw new Error(String(r.error));
  const { ok: _ok, ...rest } = r;
  return rest as unknown as T;
}
