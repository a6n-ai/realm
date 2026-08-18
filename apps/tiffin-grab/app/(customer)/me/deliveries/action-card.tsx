"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { IOS_PRESS } from "@/components/customer/ios-button";

/** Customer delivery sheets open from the thumb edge. Admin create/edit stays top. */
export const DELIVERY_SHEET_DIRECTION = "bottom" as const;

export function ActionGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 items-stretch gap-2.5", className)}>{children}</div>;
}

export const ActionCard = forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    title: string;
    description?: string;
    pending?: boolean;
    layout?: "row" | "tile";
  } & Omit<ComponentPropsWithoutRef<"button">, "children" | "title">
>(function ActionCard(
  { icon: Icon, title, description, pending = false, disabled, layout = "row", className, ...props },
  ref,
) {
  const tile = layout === "tile";
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || pending}
      aria-label={title}
      aria-busy={pending || undefined}
      className={cn(
        "touch-manipulation select-none text-left",
        "bg-black/[0.06] dark:bg-white/[0.1]",
        "active:bg-black/[0.1] dark:active:bg-white/[0.16]",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        IOS_PRESS,
        tile
          ? "flex h-full min-h-[7.25rem] flex-col items-center justify-center gap-1.5 rounded-[22px] px-3 py-3.5 text-center"
          : "flex min-h-[50px] w-full items-center gap-3 rounded-[14px] px-4 py-3",
        className,
      )}
      {...props}
    >
      <Icon
        className={cn("shrink-0 text-primary", tile ? "size-7" : "size-6")}
        aria-hidden
      />
      <span className="min-w-0">
        <span
          className={cn(
            "text-foreground block font-semibold tracking-[-0.01em]",
            tile ? "text-[15px] leading-tight" : "text-[17px] leading-snug",
          )}
        >
          {title}
        </span>
        {description ? (
          <span
            className={cn(
              "text-muted-foreground mt-0.5 block text-pretty",
              tile ? "text-[11px] leading-snug" : "text-[13px] leading-snug",
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
      {tile ? null : pending ? (
        <span className="text-muted-foreground ml-auto text-xs">Working…</span>
      ) : (
        <ChevronRightIcon className="text-muted-foreground ml-auto size-5 shrink-0" aria-hidden />
      )}
    </button>
  );
});
