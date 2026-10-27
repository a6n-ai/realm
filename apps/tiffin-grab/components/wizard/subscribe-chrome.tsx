"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { Button, IconButton } from "@/components/customer/kit";
import { Brand } from "@/components/customer/shell/customer-shell";

/**
 * The one top bar of the order flow (subscribe, new order, renew, checkout). It takes the place of the
 * app's logo bar on those pages and is built to the same 64px shape, so moving between steps moves
 * nothing: logo left (with Back from sm up; below sm Back lives in the bottom action bar), step name
 * centered, price chip and Close right.
 */
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
  /** Centered step label, e.g. "Plan". */
  stepTag?: string;
  /** Sits left of Close (e.g. the running-total chip). */
  trailing?: ReactNode;
}) {
  const router = useRouter();
  return (
    // Full-bleed out of whatever centered column renders it, like the app header (html clips the overflow-x).
    // A scroll edge, not a hairline: content fades as it passes under the glass bar.
    <header className="c-glass sticky top-0 z-40 mb-6 mr-[calc(50%-50vw)] ml-[calc(50%-50vw)] pt-[env(safe-area-inset-top)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-[var(--background)] after:to-transparent after:content-['']">
      <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Brand href={closeHref} />
          <Button
            variant="ghost"
            className="!hidden gap-1 !px-2 !text-[13px] tracking-tight sm:!inline-flex"
            onClick={() => (onBack ? onBack() : router.back())}
          >
            <ArrowLeftIcon aria-hidden className="size-3.5" />
            {backLabel}
          </Button>
        </div>
        <span className="text-[15px] font-semibold tracking-[-0.01em] max-sm:invisible">{stepTag}</span>
        <div className="flex items-center justify-end gap-2">
          {trailing}
          <IconButton href={closeHref} aria-label="Close" className="!size-11">
            <XIcon aria-hidden className="size-4" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
