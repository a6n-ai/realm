"use client";

import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@foundry/ui/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";

const BTN = cn(
  "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground",
  "transition-[transform,color,background-color] hover:bg-accent hover:text-foreground active:scale-[0.96]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export const RowActionTooltipButton = React.forwardRef<
  HTMLButtonElement,
  { icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean }
>(function RowActionTooltipButton({ icon: Icon, label, onClick, disabled }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          disabled={disabled}
          className={BTN}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
});
