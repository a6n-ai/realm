"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WhoCanSearch, type WhoCanHit } from "@foundry/crm";

/** The query lives in `?who=` so the server filters before paging. Debounced so typing does not navigate per key. */
export function WhoCanFilter({ value, results, nameOf }: { value: string; results: WhoCanHit[]; nameOf: (id: string) => string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (draft.trim()) sp.set("who", draft);
      else sp.delete("who");
      sp.delete("page");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 250);
    return () => clearTimeout(t);
  }, [draft, value, params, pathname, router]);

  return <WhoCanSearch value={draft} onChange={setDraft} results={results} nameOf={nameOf} />;
}
