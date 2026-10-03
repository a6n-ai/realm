import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Truck } from "lucide-react";
import type { DayOfWeek } from "@/lib/menu/delivery-days";

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SHORT: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const FULL: Record<DayOfWeek, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type Trip = { day: DayOfWeek; units: number; days: DayOfWeek[] };

/**
 * "How your tiffins arrive" as a week timeline: each delivery is a stop, carrying the days
 * it feeds. Phones get a vertical rail (one stop per delivery); wider screens see the whole
 * week on one horizontal rail, where a trip is a bar from its delivery day across the days
 * it covers. The vertical list is the accessible one; the horizontal rail is decorative.
 */
export function TripTimeline({ trips }: { trips: Trip[] }) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };
  const tripOf = new Map<DayOfWeek, number>();
  trips.forEach((t, i) => t.days.forEach((d) => tripOf.set(d, i)));
  const isDelivery = new Set(trips.map((t) => t.day));

  return (
    <div className="mt-5">
      {/* Phone: vertical rail. Kept for screen readers on wider screens too. */}
      <ol aria-label="Delivery preview" className="relative sm:sr-only">
        <AnimatePresence initial={false} mode="popLayout">
          {trips.map((t, i) => (
            <motion.li
              key={t.day}
              layout={!reduce}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -8 }}
              transition={spring}
              className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
            >
              {/* The rail runs from this stop down to the next one. */}
              {i < trips.length - 1 && (
                <span aria-hidden className="bg-primary/25 absolute top-8 bottom-0 left-[calc(1rem-1px)] w-0.5 rounded-full" />
              )}
              <span aria-hidden className="bg-primary text-primary-foreground relative z-10 grid size-8 place-items-center rounded-full shadow-sm">
                <Truck className="size-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[17px] leading-tight font-semibold tracking-[-0.02em]">{FULL[t.day]}</span>
                  <span className="text-primary text-[15px] font-semibold tabular-nums">{plural(t.units, "tiffin", "tiffins")}</span>
                </p>
                <p className="text-muted-foreground mt-1 text-[13px]">
                  {t.units === 1 && t.days[0] === t.day ? "Eaten the same day" : `For ${t.days.map((d) => FULL[d]).join(", ").replace(/, ([^,]*)$/, " and $1")}`}
                </p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      {/* Wider screens: the whole week on one rail. */}
      <div aria-hidden className="hidden sm:block">
        <div className="grid grid-cols-7">
          {DAYS.map((d, i) => {
            const trip = tripOf.get(d);
            const eats = trip != null;
            const delivery = isDelivery.has(d);
            const joinLeft = eats && i > 0 && tripOf.get(DAYS[i - 1]!) === trip;
            const joinRight = eats && i < 6 && tripOf.get(DAYS[i + 1]!) === trip;
            return (
              <div key={d} className="flex flex-col items-center">
                <span className={`text-[13px] font-semibold ${eats ? "text-foreground" : "text-muted-foreground/60"}`}>{SHORT[d]}</span>
                <div className="relative mt-2 flex h-8 w-full items-center justify-center">
                  {/* Base week line, then the trip's own bar over it. */}
                  <span className="bg-border absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2" />
                  {joinLeft && <span className="bg-primary absolute top-1/2 left-0 h-1 w-1/2 -translate-y-1/2" />}
                  {joinRight && <span className="bg-primary absolute top-1/2 right-0 h-1 w-1/2 -translate-y-1/2" />}
                  {delivery ? (
                    <motion.span
                      layout={!reduce}
                      transition={spring}
                      className="bg-primary text-primary-foreground relative z-10 grid size-8 place-items-center rounded-full shadow-sm"
                    >
                      <Truck className="size-4" strokeWidth={2.25} />
                    </motion.span>
                  ) : eats ? (
                    <span className="border-primary bg-card relative z-10 size-3.5 rounded-full border-[3px]" />
                  ) : (
                    <span className="bg-border relative z-10 size-2 rounded-full" />
                  )}
                </div>
                <span className="text-primary mt-2 h-5 text-[13px] font-semibold tabular-nums">
                  {delivery ? plural(trips.find((t) => t.day === d)!.units, "tiffin", "tiffins") : ""}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-primary text-primary-foreground grid size-4 place-items-center rounded-full"><Truck className="size-2.5" /></span>
            Delivery
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="border-primary size-3 rounded-full border-[3px]" />
            Eaten from that delivery
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-border size-2 rounded-full" />
            No tiffin
          </span>
        </p>
      </div>
    </div>
  );
}
