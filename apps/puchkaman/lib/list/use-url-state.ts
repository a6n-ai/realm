"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useListNav } from "@foundry/design-system";
import { useCallback } from "react";

// Copied from tiffin-grab, matching lib/list/sort.ts: these are app-local list
// conventions, not shared UI, and each app owns its own.
export function mergeParam(current: string, key: string, value: string, fallback: string): string {
  const sp = new URLSearchParams(current);
  if (value === fallback || value === "") sp.delete(key);
  else sp.set(key, value);
  return sp.toString();
}

export function useUrlState(key: string, fallback: string): [string, (v: string) => void] {
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (v: string) => {
      const qs = mergeParam(params.toString(), key, v, fallback);
      nav(qs ? `${pathname}?${qs}` : pathname);
    },
    [key, fallback, params, pathname, nav],
  );
  return [value, set];
}
