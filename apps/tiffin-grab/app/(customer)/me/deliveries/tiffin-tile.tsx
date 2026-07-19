"use client";

// The Tiffin Calendar's signature surface: a day IS its meal, not a numbered grid cell. Shared
// by the desktop month calendar's DayButton slot and the mobile week rail — same visual language,
// two sizes (`variant`). Cutoff-locked days get a "sealed lid" treatment: dimmed/desaturated
// photo, a lock badge standing in for a closed tiffin lid, and a light "it's sealed" wobble on
// tap instead of the usual press-scale — the day is still tappable (view-only detail), just not
// editable.

import { motion, useReducedMotion } from "motion/react";
import { LockIcon, UtensilsCrossedIcon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
import { cn } from "@realm/ui/cn";
import { DishImage } from "@/components/customer/home/dish-image";
import { dietDotClass } from "@/lib/menu/poster";
import { DAY_STATUS_LABEL, DAY_STATUS_RING_CLASS, type DayStatus } from "./day-status";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TiffinTile({
  date, status, dishName, dishImage, diet, extraCount = 0, isToday = false, selected = false,
  variant = "month", onClick,
}: {
  date: string;
  status: DayStatus;
  dishName: string | null;
  dishImage: FileDetail | null;
  diet: "veg" | "nonveg" | null;
  extraCount?: number;
  isToday?: boolean;
  selected?: boolean;
  variant?: "month" | "week";
  onClick?: () => void;
}) {
  const reduce = useReducedMotion();
  const local = new Date(`${date}T00:00:00`);
  const dayNum = local.getDate();
  const weekday = WEEKDAY_SHORT[local.getDay()];
  const locked = status === "locked";
  const hasMeal = dishName != null;

  const tapAnimation = reduce
    ? undefined
    : locked
      ? { rotate: [0, -2.5, 2.5, -1, 0] } // "it's sealed" nudge — not a press, a refusal
      : { scale: 0.96 };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={tapAnimation}
      transition={locked ? { duration: 0.32, ease: "easeOut" } : { type: "spring", duration: 0.3, bounce: 0 }}
      aria-label={`${weekday} ${dayNum}${dishName ? `, ${dishName}` : ""}${locked ? ", sealed" : ""}`}
      aria-pressed={selected}
      className={cn(
        // min-h/min-w keep the tap target >=44px even if a parent grid ever squeezes the cell
        // narrower than that — the tile itself still wants to fill its cell (h-full w-full).
        "group relative flex aspect-square h-full min-h-11 w-full min-w-11 flex-col overflow-hidden rounded-2xl border-2 text-left transition-shadow",
        DAY_STATUS_RING_CLASS[status],
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <div className="absolute inset-1 overflow-hidden rounded-xl outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
        {hasMeal ? (
          <div className={cn("relative h-full w-full", locked && "opacity-40 grayscale")}>
            <DishImage image={dishImage} name={dishName!} sizes={variant === "week" ? "(max-width: 640px) 30vw, 120px" : "160px"} />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <UtensilsCrossedIcon className={cn("text-muted-foreground/40", variant === "week" ? "size-6" : "size-8")} aria-hidden />
          </div>
        )}
        {/* Bottom scrim for legible date/name over any photo */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      </div>

      {/* Diet dot, top-right */}
      {diet && !locked && (
        <span
          className={cn("absolute right-2 top-2 z-10 size-2.5 rounded-full ring-1 ring-white/80", dietDotClass(diet, dishName ?? ""))}
          aria-hidden
        />
      )}

      {/* +N extra picks badge */}
      {extraCount > 0 && !locked && (
        <span className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-medium leading-none text-white">
          +{extraCount}
        </span>
      )}

      {/* Sealed-lid lock badge, centered */}
      {locked && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className={cn("flex items-center justify-center rounded-full bg-black/45 backdrop-blur-[1px]", variant === "week" ? "size-8" : "size-10")}>
            <LockIcon className={cn("text-white/90", variant === "week" ? "size-4" : "size-5")} aria-hidden />
          </span>
        </div>
      )}

      {/* Date / weekday / dish name, bottom-anchored */}
      <div className={cn("relative z-10 mt-auto flex flex-col gap-0 text-white", variant === "week" ? "px-2 pb-2 pt-1" : "px-2.5 pb-2 pt-1")}>
        <span className={cn("font-medium uppercase tracking-wide text-white/80", variant === "week" ? "text-[10px]" : "text-xs")}>{weekday}</span>
        <span className={cn("tabular-nums font-semibold leading-tight", variant === "week" ? "text-lg" : "text-xl")}>{dayNum}</span>
        <span className={cn("mt-0.5 truncate leading-tight text-white/85", variant === "week" ? "text-[11px]" : "text-xs")}>
          {locked ? "Sealed" : hasMeal ? dishName : DAY_STATUS_LABEL[status]}
        </span>
      </div>

      {isToday && <span className="absolute left-2 top-2 z-10 size-2 rounded-full bg-primary ring-1 ring-white/80" aria-hidden />}
    </motion.button>
  );
}
