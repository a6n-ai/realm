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
import { labelForSegment } from "./route-labels";

export type Crumb = { label: string; href?: string };

// publicId segments (e.g. ord_aB3…): meaningless in a breadcrumb unless an
// override gives them a human label, so drop the raw ones from the trail.
const isIdLike = (seg: string) => /^[a-z]{3}_[A-Za-z0-9_-]{4,}$/.test(seg);

export function deriveBreadcrumbs(pathname: string, overrides: Record<string, string> = {}): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const visible = segments
    .map((seg, i) => ({ seg, i }))
    .filter(({ seg }) => overrides[seg] || !isIdLike(seg));
  return visible.map(({ seg, i }, vi) => {
    const isLast = vi === visible.length - 1;
    const label = overrides[seg] ?? labelForSegment(seg);
    return isLast ? { label } : { label, href: "/" + segments.slice(0, i + 1).join("/") };
  });
}

export function Breadcrumbs({ overrides }: { overrides?: Record<string, string> }) {
  const pathname = usePathname();
  const crumbs = deriveBreadcrumbs(pathname, overrides);
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
