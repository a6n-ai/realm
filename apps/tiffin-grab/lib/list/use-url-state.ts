"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function mergeParam(current: string, key: string, value: string, fallback: string): string {
  const sp = new URLSearchParams(current);
  if (value === fallback || value === "") sp.delete(key);
  else sp.set(key, value);
  return sp.toString();
}

export function dropParams(current: string, keys: string[]): string {
  const sp = new URLSearchParams(current);
  for (const k of keys) sp.delete(k);
  return sp.toString();
}

export function useUrlState(key: string, fallback: string): [string, (v: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (v: string) => {
      const qs = mergeParam(params.toString(), key, v, fallback);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, fallback, params, pathname, router],
  );
  return [value, set];
}

// Removes several keys in ONE navigation. Calling multiple useUrlState setters
// in one tick clobbers each other (each merges over the same stale snapshot);
// use this for "clear all filters".
export function useClearUrlKeys(): (keys: string[]) => void {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (keys: string[]) => {
      const qs = dropParams(params.toString(), keys);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
}
