"use client";

import type { ComponentProps } from "react";
import { TooltipContent } from "@foundry/ui/tooltip";
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
