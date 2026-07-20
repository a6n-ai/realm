"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { SectionCard } from "@/components/ds";

/** Slim subscribe strip — replaces oversized Browse plans + Meal sizes cards on Menu. */
export function PlansCtaSection() {
  return (
    <SectionCard title="Want a subscription?">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-md text-sm text-pretty">
          Pick a plan and meal size on Subscribe. This page is for browsing what&apos;s cooking.
        </p>
        <Link
          href="/subscribe"
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-transform active:scale-[0.96]"
        >
          Browse plans
          <ArrowRightIcon className="size-3.5" aria-hidden />
        </Link>
      </div>
    </SectionCard>
  );
}

export function PlansCtaSectionSkeleton() {
  return (
    <SectionCard title="Want a subscription?">
      <div className="bg-muted h-10 w-full animate-pulse rounded-md" />
    </SectionCard>
  );
}
