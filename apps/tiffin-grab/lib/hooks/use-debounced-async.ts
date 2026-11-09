import { useEffect, useRef, useState } from "react";

/**
 * Runs `fn` `delay` ms after `key` last changed (never when `key` is null). The latest settled result is
 * returned with the key it was fetched for, so a caller that wants "nothing yet" while the key moves on
 * compares `found.key === key`. A result that lands after the key changed or the component unmounted is
 * dropped; a rejection settles as `empty`. `reload` re-runs the current key at once.
 */
export function useDebouncedAsync<T>(key: string | null, fn: () => Promise<T>, delay: number, empty: T) {
  const [found, setFound] = useState<{ key: string | null; value: T }>({ key: null, value: empty });
  const [nonce, setNonce] = useState(0);
  const latest = useRef({ fn, empty, delay });
  const immediate = useRef(false);
  useEffect(() => { latest.current = { fn, empty, delay }; });

  useEffect(() => {
    if (key == null) return;
    let stale = false;
    const wait = immediate.current ? 0 : latest.current.delay;
    immediate.current = false;
    const t = setTimeout(async () => {
      let value: T;
      try { value = await latest.current.fn(); } catch { value = latest.current.empty; }
      if (!stale) setFound({ key, value });
    }, wait);
    return () => { stale = true; clearTimeout(t); };
  }, [key, nonce]);

  return { ...found, reload: () => { immediate.current = true; setNonce((n) => n + 1); } };
}
