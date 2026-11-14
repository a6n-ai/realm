"use client";

import type { ComponentProps } from "react";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@foundry/ui/tooltip";
import { cn } from "@foundry/ui/cn";

/** Analytics hover card: the popover surface, not the inverted default; the arrow is hidden because it stays dark. */
export function ChartTip({ className, sideOffset = 6, ...props }: ComponentProps<typeof TooltipContent>) {
  return (
    <TooltipContent
      sideOffset={sideOffset}
      className={cn("bg-popover text-popover-foreground border shadow-md [&>svg]:hidden", className)}
      {...props}
    />
  );
}

/** Small info icon beside a card subtitle; the longer note opens on hover or focus. */
export function InfoTip({ children }: { children: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="More info" className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
            <InfoIcon className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <ChartTip className="max-w-xs">{children}</ChartTip>
      </Tooltip>
    </TooltipProvider>
  );
}
