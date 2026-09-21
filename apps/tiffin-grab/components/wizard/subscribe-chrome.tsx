"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { Button, IconButton } from "@/components/customer/kit";

/** Sticky top chrome for public subscribe/checkout — Back + Close so users aren't trapped. Back shows here from sm up; below sm it lives in the bottom action bar. */
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
        variant="ghost"
        className="-ml-2 hidden gap-1 !px-1.5 !text-[13px] tracking-tight sm:inline-flex"
        onClick={() => (onBack ? onBack() : router.back())}
      >
        <ArrowLeftIcon aria-hidden className="size-3.5" />
        {backLabel}
      </Button>
      {stepTag && (
        <span className="absolute left-1/2 hidden sm:block -translate-x-1/2 text-[15px] font-semibold tracking-[-0.01em]">
          {stepTag}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
      {trailing}
      <IconButton href={closeHref} aria-label="Close">
        <XIcon aria-hidden className="size-4" />
      </IconButton>
      </div>
    </div>
  );
}
