"use client";

import { CalendarCheck, Check, House, Truck } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle } from "@/components/reui/stepper";
import { humanDate, type Trip } from "@/lib/deliveries-view";
import { cutoffFmt } from "@/components/customer/deliveries/trip-parts";

// Same stage rule as the customer's Journey: the tiffin is on the way only once its stop is on a route.
const STAGE: Partial<Record<Trip["status"], number>> = { upcoming: 0, "cutoff-passed": 0, locked: 0, unconfirmed: 1, delivered: 2 };

/** Scheduled, On the way, Delivered for one delivery, each stop with the fact staff ask about next. */
export function DeliveryStepper({ trip, now, tz, driver }: { trip: Trip; now: number; tz: string; driver?: string | null }) {
  const stage = trip.status === "unconfirmed" && !trip.routePushed ? 0 : STAGE[trip.status];
  if (stage == null) return null;
  const delivered = stage === 2;
  const stops = [
    { label: "Scheduled", Icon: CalendarCheck, detail: trip.cutoffAt > now ? `Changes until ${cutoffFmt(trip.cutoffAt, tz)}` : "Changes closed" },
    { label: "On the way", Icon: Truck, detail: driver ? `Driver ${driver}` : delivered ? "Done" : trip.routePushed ? "On a route" : "Not on a route yet" },
    { label: "Delivered", Icon: House, detail: delivered ? humanDate(trip.date) : `Due ${humanDate(trip.date)}` },
  ];
  // One past the last stop marks every stop complete once the tiffin is delivered.
  const value = delivered ? stops.length + 1 : stage + 1;
  // Delivered reads emerald, the same as the calendar's Delivered days; in progress uses the primary.
  const tone = delivered
    ? "data-[state=completed]:bg-emerald-600 data-[state=completed]:text-white dark:data-[state=completed]:bg-emerald-500"
    : "";

  return (
    <Stepper value={value} indicators={{ completed: <Check className="size-4" aria-hidden /> }} aria-label={`${stops[Math.min(stage, 2)]!.label} delivery`} data-testid="journey">
      <StepperNav className="items-start">
        {stops.map(({ label, Icon, detail }, i) => (
          <StepperItem key={label} step={i + 1} className="min-w-0 items-stretch group-data-[orientation=horizontal]/stepper-nav:flex-col">
            <div className="flex items-center">
              <StepperIndicator className={cn("size-8", tone)}>
                <Icon className="size-4" aria-hidden />
              </StepperIndicator>
              {i < stops.length - 1 && (
                <StepperSeparator className={cn("mx-2 data-[state=completed]:bg-primary", delivered && "data-[state=completed]:bg-emerald-600 dark:data-[state=completed]:bg-emerald-500")} />
              )}
            </div>
            <div className="flex flex-col gap-1 pt-2 pe-2">
              <StepperTitle className="data-[state=inactive]:text-muted-foreground">{label}</StepperTitle>
              <p className="text-muted-foreground text-xs">{detail}</p>
            </div>
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  );
}
