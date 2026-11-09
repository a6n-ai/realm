import { useDebouncedAsync } from "@foundry/ui/use-debounced-async";
import { searchGroupsAction } from "./actions";

const FAILED = { ok: false as const, error: "The request did not finish." };

/** Groups matching `q` (an empty query lists them at once); `groups` is null until the first answer. */
export function useGroupSearch(q: string, enabled = true) {
  const found = useDebouncedAsync(enabled ? q : null, () => searchGroupsAction(q), q ? 250 : 0, FAILED);
  const res = found.key == null ? null : found.value;
  return { groups: res?.ok ? res.data : null, error: res && !res.ok ? res.error : null, reload: found.reload };
}
