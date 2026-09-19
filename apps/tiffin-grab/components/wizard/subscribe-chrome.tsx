"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";

/** Sticky top chrome for public subscribe/checkout — Back + Close so users aren't trapped. */
export function SubscribeChrome({
  closeHref,
  onBack,
  backLabel = "Back",
  stepTag,
  trailing,
}: {
  closeHref: string;
  onBack?: () => void;
  backLabel?: string;
  /** Centered uppercase step label shown in the sticky bar, e.g. "BASELINE". */
  stepTag?: string;
  /** Sits left of Close (e.g. the running-total chip). */
  trailing?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="bg-background/80 sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between border-b px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] backdrop-blur-xl backdrop-saturate-150 sm:mx-0 sm:px-0 sm:pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-11 font-semibold tracking-tight"
        onClick={() => (onBack ? onBack() : router.back())}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {backLabel}
      </Button>
      {stepTag && (
        <span className="absolute left-1/2 hidden sm:block -translate-x-1/2 text-[15px] font-semibold tracking-[-0.01em]">
          {stepTag}
        </span>
      )}
      <div className="flex items-center gap-2">
      {trailing}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        asChild
        aria-label="Close"
        className="size-11 rounded-full bg-muted"
      >
        <Link href={closeHref}>
          <XIcon />
        </Link>
      </Button>
      </div>
    </div>
  );
}
