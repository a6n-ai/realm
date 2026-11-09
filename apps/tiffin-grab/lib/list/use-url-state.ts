"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useListNav } from "@foundry/design-system";
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

