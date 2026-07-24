"use client";

// Mobile-first order card under the month grid (13895.jpg + older Claude chat):
// dish thumb + name + status badges; Vacation opens the shared VacationControl drawer/dialog
// (day-tap stays meal-only). "Menu not released" when the week isn't out yet.

import { PalmtreeIcon, PlayIcon, UtensilsCrossedIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { DishImage } from "@/components/customer/home/dish-image";
import type { CalendarCell } from "./calendar-constants";
import { calendarDayStatus, calendarLegendKey, CALENDAR_LEGEND } from "./day-status";
import { menuNotPublishedCopy, menuNotReleasedCopy } from "./day-summary-message";
import { cellToTileData } from "./tile-data";
import { mealChips, type DeliveryCardMeal } from "./meal-chips";
import type { CustomerDelivery } from "@/lib/services/customer-deliveries.service";

type Address = { fullName: string; addressLine: string; city: string; postalCode: string };
type DeliveryCardData = CustomerDelivery & { meal: DeliveryCardMeal; address: Address; hasAddressOverride: boolean };

const STATUS_BADGE: Record<"delivered" | "upcoming" | "vacation" | "onHold", string> = {
  delivered: "bg-ok/15 text-ok",
  upcoming: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  vacation: "bg-warn/15 text-warn",
  onHold: "bg-destructive/15 text-destructive",
};

const STATUS_COPY: Record<"delivered" | "upcoming" | "vacation" | "onHold", string> = {
  delivered: "Delivered",
  upcoming: "To be Delivered",
  vacation: "On Vacation",
  onHold: "On Hold",
};

export function MobileDayOrderCard({
  dateIso,
  cell,
  delivery,
  planName,
  paused = false,
  onPauseClick,
}: {
  dateIso: string;
  cell: CalendarCell | undefined;
  delivery: DeliveryCardData | undefined;
  planName: string;
  paused?: boolean;
  onPauseClick?: () => void;
}) {
  const kind: "cell" | "unreleased" | "off" = cell ? "cell" : delivery ? "unreleased" : "off";
  const status = cell ? calendarDayStatus(cell) : "off";
  const legendKey = cell ? calendarLegendKey(status) : null;
  const tile = cell ? cellToTileData(cell) : null;
  const chips = delivery ? mealChips(delivery.meal) : [];
  const dishName = tile?.dishName ?? chips[0]?.replace(/^\d+×\s*/, "") ?? null;
  const dishImage = tile?.dishImage ?? null;
  const menuNotReleased = kind === "cell" && status !== "locked" && !(cell?.menuWeekId && (cell?.options.length ?? 0) > 0);

  if (kind === "off") {
    return (
      <div className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        There are no orders scheduled for this day
      </div>
    );
  }

  if (kind === "unreleased" || menuNotReleased) {
    return (
      <div className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        {kind === "unreleased" ? menuNotPublishedCopy(dateIso) : menuNotReleasedCopy(dateIso)}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex gap-3 p-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted outline outline-1 -outline-offset-1 outline-black/10">
          {dishImage || dishName ? (
            <DishImage image={dishImage} name={dishName ?? "Meal"} sizes="80px" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <UtensilsCrossedIcon className="size-6 text-muted-foreground/40" aria-hidden />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">
            {dishName ?? "Meal not picked yet"}
          </p>
          {tile && tile.extraCount > 0 && (
            <p className="text-xs text-muted-foreground">+{tile.extraCount} more</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700 dark:text-orange-400">
              Subscription
            </span>
            {legendKey && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[legendKey])}>
                {STATUS_COPY[legendKey]}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{planName}</p>
        </div>
      </div>

      {onPauseClick && status !== "locked" && (
        <div className="flex items-center border-t px-3 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-orange-400/60 text-orange-700 dark:text-orange-400"
            onClick={onPauseClick}
          >
            {paused ? <PlayIcon className="size-3.5" /> : <PalmtreeIcon className="size-3.5" />}
            {paused ? "Resume" : "Vacation"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function MobileLegendRow() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-0.5 text-[11px] text-muted-foreground">
      {CALENDAR_LEGEND.map(({ key, label, dashClass }) => (
        <span key={key} className="flex items-center gap-1">
          <span className={cn("h-[3px] w-4 rounded-full", dashClass)} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
