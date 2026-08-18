"use client";

// Mobile-first order card under the month grid: dish thumb + name + status badges.
// Day-tap stays meal-only. Vacation sits in the day-action tile grid below this card.

import { UtensilsCrossedIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { DietTag, PlanBox } from "@/components/customer/plan-box";
import { DishImage } from "@/components/customer/home/dish-image";
import type { CalendarCell } from "./calendar-constants";
import { calendarDayStatus, calendarLegendKey } from "./day-status";
import { menuNotPublishedCopy, menuNotReleasedCopy } from "./day-summary-message";
import { cellToTileData } from "./tile-data";
import { mealChips, type DeliveryCardMeal } from "./meal-chips";
import type { CustomerDelivery } from "@/lib/services/customer-deliveries.service";

type Address = { fullName: string; addressLine: string; city: string; postalCode: string };
type DeliveryCardData = CustomerDelivery & { meal: DeliveryCardMeal; address: Address; hasAddressOverride: boolean };

const STATUS_BADGE: Record<"delivered" | "upcoming" | "vacation" | "onHold", string> = {
  delivered: "bg-emerald-500 text-white",
  upcoming: "bg-sky-500 text-white",
  vacation: "bg-orange-500 text-white",
  onHold: "bg-rose-500 text-white",
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
  mealSizeName,
  planName,
  tagLabel,
  tagColor,
}: {
  dateIso: string;
  cell: CalendarCell | undefined;
  delivery: DeliveryCardData | undefined;
  mealSizeName: string;
  planName: string;
  tagLabel?: string | null;
  tagColor?: string | null;
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
    <PlanBox color={tagColor} className="overflow-hidden p-3">
      <div className="flex gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted outline outline-1 -outline-offset-1 outline-black/10">
          {dishImage || dishName ? (
            <DishImage image={dishImage} name={dishName ?? "Meal"} category={tile?.dishCategory} sizes="80px" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <UtensilsCrossedIcon className="size-6 text-muted-foreground/40" aria-hidden />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold leading-snug tracking-tight">{mealSizeName}</p>
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {dishName ?? "Meal not picked yet"}
            {tile && tile.extraCount > 0 ? ` · +${tile.extraCount} more` : ""}
          </p>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <DietTag label={tagLabel || planName} color={tagColor} />
            {legendKey && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[legendKey])}>
                {STATUS_COPY[legendKey]}
              </span>
            )}
          </div>
        </div>
      </div>
    </PlanBox>
  );
}
