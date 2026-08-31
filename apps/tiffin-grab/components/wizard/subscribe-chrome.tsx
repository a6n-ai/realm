"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";

/** Sticky top chrome for public subscribe/checkout — Back + Close so users aren't trapped. */
export function SubscribeChrome({
  closeHref,
  onBack,
  backLabel = "Back",
  stepTag,
}: {
  closeHref: string;
  onBack?: () => void;
  backLabel?: string;
  /** Centered uppercase step label shown in the sticky bar, e.g. "BASELINE". */
  stepTag?: string;
}) {
  const router = useRouter();
  return (
    <div className="bg-background/95 sticky top-0 z-30 -mx-4 relative mb-4 flex items-center justify-between border-b-[1.5px] border-foreground px-4 py-2.5 backdrop-blur sm:-mx-0 sm:px-0">
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
        <span className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold tracking-[2.5px] text-muted-foreground uppercase">
          {stepTag}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        asChild
        aria-label="Close"
        className="size-11 rounded-full border-[1.5px] border-foreground"
      >
        <Link href={closeHref}>
          <XIcon />
        </Link>
      </Button>
    </div>
  );
}
