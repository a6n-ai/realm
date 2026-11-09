"use client";

import { Fragment, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deriveBreadcrumbs } from "@foundry/design-system";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@foundry/ui/breadcrumb";
import { sessionStore } from "@/lib/storage";
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

// Last full URL (with ?filters/tab/sort/page) seen per path, so a crumb back to a
// list lands where staff left it. Per tab session; storage may throw (private mode).
const KEY = (path: string) => `crumb:${path}`;
const remembered = (path: string) => sessionStore.get(KEY(path)) ?? path;

export function AppBreadcrumbs() {
  const overrides = useContext(Ctx)?.overrides;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    sessionStore.set(KEY(pathname), search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);

  const crumbs = deriveBreadcrumbs(pathname, labelForSegment, overrides);
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <BreadcrumbItem>
              {c.href ? (
                // Plain href for SSR/hydration; the remembered URL (with filters) is read on click.
                <BreadcrumbLink asChild>
                  <Link
                    href={c.href}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      router.push(remembered(c.href!));
                    }}
                  >
                    {c.label}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {i < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
