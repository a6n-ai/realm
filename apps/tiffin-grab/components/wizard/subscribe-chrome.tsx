"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { Button, IconButton, ThemeToggle } from "@/components/customer/kit";
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
  topBack = false,
}: {
  closeHref: string;
  onBack?: () => void;
  backLabel?: string;
  /** A Back link in this bar (from sm up). Off where the page's bottom bar already has Back at every width. */
  topBack?: boolean;
  /** Centered step label, e.g. "Plan". */
  stepTag?: string;
  /** Sits left of Close (e.g. the running-total chip). */
  trailing?: ReactNode;
}) {
  const router = useRouter();
  return (
    // Full-bleed out of whatever centered column renders it, like the app header (html clips the overflow-x).
    // A scroll edge, not a hairline: content fades as it passes under the glass bar.
    <header className="c-glass sticky top-0 z-40 mb-6 mr-[calc(50%-50vw)] ml-[calc(50%-50vw)] pt-[env(safe-area-inset-top)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-background after:to-transparent after:content-['']">
      <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* The logo answers a pointer like every other link here: a small lift. */}
          <Brand href={closeHref} />
          {topBack ? <Button
            variant="ghost"
            className="group !hidden gap-1 !px-2 !text-footnote tracking-tight sm:!inline-flex transition-transform duration-300 ease-soft active:scale-[0.97] hover:-translate-y-0.5"
            onClick={() => (onBack ? onBack() : router.back())}
          >
            <ArrowLeftIcon aria-hidden className="size-3.5 transition-transform duration-300 ease-soft group-hover:-translate-x-0.5" />
            {backLabel}
          </Button> : null}
        </div>
        <span className="text-subhead font-semibold tracking-[-0.01em] max-sm:invisible">{stepTag}</span>
        <div className="flex items-center justify-end gap-2">
          {trailing}
          {/* Light or dark, beside Close; both bare, so the bar stays two quiet icons. */}
          <ThemeToggle lightDark className="![background-image:none] !bg-transparent hover:!bg-foreground/10" />
          <IconButton bare href={closeHref} aria-label="Close" className="!size-11 transition-transform duration-300 ease-soft active:scale-90 hover:-translate-y-0.5 [&_svg]:transition-transform [&_svg]:duration-500 [&_svg]:ease-[cubic-bezier(0.22,1,0.36,1)] hover:[&_svg]:rotate-90 active:[&_svg]:rotate-180 motion-reduce:transition-none motion-reduce:[&_svg]:transition-none">
            <XIcon aria-hidden className="size-4" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
