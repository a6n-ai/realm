"use client";

import { toast } from "sonner";

interface Problem {
  title?: string;
  detail?: string;
  status?: number;
}

// Client fetch that surfaces RFC 9457 problem+json failures as a Sonner toast.
// On !ok: reads `detail` (falls back to title, then status), toasts it, throws
// so the caller can bail. On 204/empty: returns undefined. Otherwise parses JSON.
export async function apiFetch<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const p = (await res.json().catch(() => ({}))) as Problem;
    const msg = p.detail ?? p.title ?? `Request failed (${res.status})`;
    toast.error(msg);
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
