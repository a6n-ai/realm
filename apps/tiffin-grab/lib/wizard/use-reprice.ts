import { useEffect, type DependencyList } from "react";
import { reprice } from "@/lib/wizard/actions";

type Outcome = Awaited<ReturnType<typeof reprice>>;

/**
 * Reprices when `deps` change, dropping a reply that a newer run has superseded. `request`
 * returns the reprice arguments, or null when there is nothing to price yet (`onSkip`).
 * Callers keep their own state: loading flags, error text and what to do with the result.
 */
export function useReprice(
  request: () => Parameters<typeof reprice> | null,
  h: { onStart?: () => void; onSkip?: () => void; onResult: (r: Outcome) => void; onError: () => void },
  deps: DependencyList,
) {
  useEffect(() => {
    const args = request();
    if (!args) { h.onSkip?.(); return; }
    let active = true;
    h.onStart?.();
    reprice(...args)
      .then((r) => { if (active) h.onResult(r); })
      .catch(() => { if (active) h.onError(); });
    return () => { active = false; };
    // The caller lists what the request reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
