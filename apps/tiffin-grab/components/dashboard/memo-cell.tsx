"use client";

import { TableCell } from "@foundry/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";

/** Truncated memo cell; the full text shows on hover or focus. No memo, no tooltip. */
export function MemoCell({ memo }: { memo: string | null }) {
  if (!memo) return <TableCell className="max-w-[280px]" />;
  return (
    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="block truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{memo}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-pre-wrap break-words">{memo}</TooltipContent>
      </Tooltip>
    </TableCell>
  );
}
