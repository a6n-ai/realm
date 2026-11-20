"use client";

import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";

/** Wraps one element in the ui Tooltip; with nothing to say it renders the element alone. */
export function HoverHint({ text, children }: { text: string | null | undefined; children: ReactElement }) {
  if (!text) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
