"use client";

import Link from "next/link";
import { Loader2Icon, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@foundry/ui/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";

export const ROW_ACTION_CLASS = cn(
  // In a table cell the 32px hit area overhangs the row instead of making it taller than text-only rows.
  "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground in-[td]:-my-1.5",
  "hover:bg-accent hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * RowActionButton (@foundry/design-system) only sets a native `title` — slow
 * and unstyled. This is the same visual button with an instant on-brand
 * tooltip on hover, for table row actions that need the extra clarity.
 */
export const RowActionTooltipButton = React.forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    /** Icon color class (e.g. a status tone); default is muted. */
    tone?: string;
    /** Tooltip text when it should say more than the aria label. */
    hint?: string;
    /** Renders a real link (cmd/middle-click, new tab) instead of a button. */
    href?: string;
    /** The action is running: spinner in place of the icon, and disabled until it settles. */
    pending?: boolean;
  }
>(function RowActionTooltipButton({ icon: Icon, label, onClick, disabled, tone, hint, href, pending }, ref) {
  const icon = pending ? (
    <Loader2Icon aria-hidden className={cn("size-4 animate-spin", tone)} />
  ) : (
    <Icon className={cn("size-4", tone)} />
  );
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <Tooltip>
      <TooltipTrigger render={
        href ? (
          <Link href={href} prefetch={false} aria-label={label} className={ROW_ACTION_CLASS} onClick={stop}>
            {icon}
          </Link>
        ) : (
          <button
            ref={ref}
            type="button"
            aria-label={label}
            aria-busy={pending || undefined}
            disabled={disabled || pending}
            className={ROW_ACTION_CLASS}
            onClick={(e) => {
              stop(e);
              onClick?.();
            }}
          >
            {icon}
          </button>
        )
      } />
      <TooltipContent side="top">{hint ?? label}</TooltipContent>
    </Tooltip>
  );
});
