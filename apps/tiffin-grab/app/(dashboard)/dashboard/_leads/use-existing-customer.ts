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
  const [hit, setHit] = useState<ExistingCustomer | null>(null);

  useEffect(() => {
    const p = phone.trim();
    const e = email.trim();
    if (p.length < 6 && e.length < 3) { setHit(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await findCustomerByContact(p, e || undefined);
        if (!cancelled) setHit(r && r.publicId !== exceptId ? r : null);
      } catch {
        if (!cancelled) setHit(null);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [phone, email, exceptId]);

  return hit;
}
