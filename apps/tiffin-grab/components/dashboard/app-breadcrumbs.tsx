"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Breadcrumbs } from "@foundry/design-system";
import { labelForSegment } from "@/components/ds/route-labels";

// Detail pages name their id segment (e.g. inq_abc → "Riya Anand") so the trail reads
// Dashboard › Inquiries › Riya Anand with Inquiries linked, instead of dropping the id
// and leaving the list as an unclickable last crumb.
type Labels = { set: (segment: string, label: string | null) => void; overrides: Record<string, string> };
const Ctx = createContext<Labels | null>(null);

export function BreadcrumbLabelsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const set = (segment: string, label: string | null) =>
    setOverrides((o) => {
      if (label === null) {
        if (!(segment in o)) return o;
        const { [segment]: _, ...rest } = o;
        return rest;
      }
      return o[segment] === label ? o : { ...o, [segment]: label };
    });
  return <Ctx.Provider value={{ set, overrides }}>{children}</Ctx.Provider>;
}

/** Render on a detail page: names `segment` (its public id) in the top-bar breadcrumbs. */
export function BreadcrumbLabel({ segment, label }: { segment: string; label: string }) {
  const ctx = useContext(Ctx);
  const set = ctx?.set;
  useEffect(() => {
    set?.(segment, label);
    return () => set?.(segment, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` is recreated per render; segment/label drive it.
  }, [segment, label]);
  return null;
}

// Breadcrumbs is a client component; the function prop can't cross the
// server→client boundary. Bind labelForSegment here, client-to-client.
export function AppBreadcrumbs() {
  const overrides = useContext(Ctx)?.overrides;
  return <Breadcrumbs resolveLabel={labelForSegment} overrides={overrides} />;
}
