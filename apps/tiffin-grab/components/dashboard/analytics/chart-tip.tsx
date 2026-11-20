"use client";

import type { ComponentProps } from "react";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";

export function ChartTip({ sideOffset = 6, ...props }: ComponentProps<typeof TooltipContent>) {
  return <TooltipContent sideOffset={sideOffset} {...props} />;
}

/** Small info icon beside a card title; the note opens on hover or focus. `inLink` swaps the button for a
 *  span, because a button inside a card link is nested interactive content and its click would navigate. */
export function InfoTip({ children, inLink = false }: { children: string; inLink?: boolean }) {
  const cls = "text-muted-foreground hover:text-foreground shrink-0";
  const icon = <InfoIcon className="size-3.5" aria-hidden />;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          inLink ? (
            <span role="img" aria-label={children} className={cls}>{icon}</span>
          ) : (
            <button type="button" aria-label="More info" className={cls}>{icon}</button>
          )
        }
      />
      <ChartTip className="max-w-xs">{children}</ChartTip>
    </Tooltip>
  );
}
