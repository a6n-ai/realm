"use client";

import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";

/** Short label on hover/focus for compact header icon controls. */
export function HeaderTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip delay={0}>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
