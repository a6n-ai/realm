"use client";

import { useDebouncedAsync } from "@/lib/hooks/use-debounced-async";
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
  const found = useDebouncedAsync<ExistingCustomer | null>(
    p.length < 6 && e.length < 3 ? null : key,
    async () => {
      const r = await findCustomerByContact(p, e || undefined);
      return r && r.publicId !== exceptId ? r : null;
    },
    400,
    null,
  );
  return found.key === key ? found.value : null;
}
