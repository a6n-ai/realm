"use client";

// Mobile-only banner above the week strip (Akshayakalpa-style): one line about the currently
// selected day, collapsible so the strip stays the visual focus when the customer already knows.

import { useState } from "react";
import { ChevronUpIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import type { CalendarCell } from "./calendar-constants";
import type { DeliveryCardMeal } from "./meal-chips";
import { selectedDaySummaryMessage } from "./day-summary-message";

export function SelectedDaySummary({
  dateIso,
  cell,
  delivery,
  alwaysVisible = false,
}: {
  dateIso: string;
  cell: CalendarCell | undefined;
  delivery: { meal: DeliveryCardMeal } | undefined;
  /** When true, show on desktop too (home week strip). Default: mobile-only for deliveries calendar. */
  alwaysVisible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const message = selectedDaySummaryMessage({ dateIso, cell, delivery });

  return (
    <button
      type="button"
      onClick={() => setCollapsed((c) => !c)}
      className={cn(
        "flex w-full items-start justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground",
        !alwaysVisible && "md:hidden",
      )}
      aria-expanded={!collapsed}
    >
      {!collapsed && <span className="min-w-0 flex-1 leading-snug">{message}</span>}
      {collapsed && <span className="text-xs font-medium text-foreground">Day summary</span>}
      <ChevronUpIcon
        className={cn("mt-0.5 size-4 shrink-0 transition-transform", collapsed && "rotate-180")}
        aria-hidden
      />
    </button>
  );
}
