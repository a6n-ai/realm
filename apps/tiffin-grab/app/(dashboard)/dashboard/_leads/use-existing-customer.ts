"use client";

import { useEffect, useState } from "react";
import { findCustomerByContact } from "./match-actions";

export type ExistingCustomer = { publicId: string; fullName: string };

/** Debounced check: does the entered phone/email already belong to a customer?
 * Returns that customer (to block a duplicate) — except `exceptId`, which is the
 * customer the staffer deliberately picked from search (reuse is fine). */
export function useExistingCustomer(
  phone: string,
  email: string,
  exceptId?: string | null,
): ExistingCustomer | null {
  const p = phone.trim();
  const e = email.trim();
  const key = `${p}|${e}|${exceptId ?? ""}`;
  // The result carries the contact it was looked up for, so "nothing yet" is derived
  // instead of written synchronously in the effect, and a stale hit cannot linger.
  const [found, setFound] = useState<{ key: string; hit: ExistingCustomer | null }>({
    key: "",
    hit: null,
  });

  useEffect(() => {
    if (p.length < 6 && e.length < 3) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await findCustomerByContact(p, e || undefined);
        if (!cancelled) setFound({ key, hit: r && r.publicId !== exceptId ? r : null });
      } catch {
        if (!cancelled) setFound({ key, hit: null });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [p, e, exceptId, key]);

  return found.key === key ? found.hit : null;
}
