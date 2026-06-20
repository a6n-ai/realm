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
} from "@/components/ui/breadcrumb";
import { labelForSegment } from "./route-labels";

export type Crumb = { label: string; href?: string };

export function deriveBreadcrumbs(pathname: string, overrides: Record<string, string> = {}): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((seg, i) => {
    const isLast = i === segments.length - 1;
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
