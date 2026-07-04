"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@realm/ui/breadcrumb";
export type Crumb = { label: string; href?: string };

// Resolve a raw path segment to a display label. Injected by the app so this
// component stays free of any client's route vocabulary.
export type ResolveLabel = (segment: string) => string;

// publicId segments (e.g. ord_aB3…): meaningless in a breadcrumb unless an
// override gives them a human label, so drop the raw ones from the trail.
const isIdLike = (seg: string) => /^[a-z]{3}_[A-Za-z0-9_-]{4,}$/.test(seg);

export function deriveBreadcrumbs(
  pathname: string,
  resolveLabel: ResolveLabel,
  overrides: Record<string, string> = {},
): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const visible = segments
    .map((seg, i) => ({ seg, i }))
    .filter(({ seg }) => overrides[seg] || !isIdLike(seg));
  return visible.map(({ seg, i }, vi) => {
    const isLast = vi === visible.length - 1;
    const label = overrides[seg] ?? resolveLabel(seg);
    return isLast ? { label } : { label, href: "/" + segments.slice(0, i + 1).join("/") };
  });
}

export function Breadcrumbs({
  resolveLabel,
  overrides,
}: {
  resolveLabel: ResolveLabel;
  overrides?: Record<string, string>;
}) {
  const pathname = usePathname();
  const crumbs = deriveBreadcrumbs(pathname, resolveLabel, overrides);
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <BreadcrumbItem>
              {c.href ? <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink> : <BreadcrumbPage>{c.label}</BreadcrumbPage>}
            </BreadcrumbItem>
            {i < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
