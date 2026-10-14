"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { ResponsiveDialog } from "@/components/ds";
import { unwrapAction } from "@/lib/actions/unwrap";
import { NO_WEEKEND_DISH, eatingDaysError, planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";
import { changeEatingDaysAction } from "./actions";

const WEEK: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const cap = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

/** Admin: change the days a customer eats. Delivery days and the tiffin balance stay; the server reschedules what's still open. */
export function EatingDaysControl({
  orderId,
  eatingDays,
  deliveryDays,
  servesWeekends,
  bounds,
  toFiveDay = false,
}: {
  orderId: string;
  eatingDays: DayOfWeek[];
  /** The frequency's delivery days: every eating day rides the nearest one at or before it. */
  deliveryDays: DayOfWeek[];
  servesWeekends: boolean;
  bounds: { min: number; max: number };
  /** A WordPress plan still on MWF: saving moves it to 5-day delivery, even with the same days. */
  toFiveDay?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(eatingDays);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const invalid = eatingDaysError(deliveryDays, value, bounds);
  const combined = (planWeek(deliveryDays, value) ?? []).filter((t) => t.units > 1);
  const unchanged = value.join() === eatingDays.join() && !toFiveDay;

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await unwrapAction(changeEatingDaysAction(orderId, value));
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change the eating days");
      }
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) { setValue(eatingDays); setError(null); }
      }}
      trigger={<Button size="sm" variant="ghost" className="-my-1 h-7 px-2">Edit</Button>}
      title="Change eating days"
      description={toFiveDay
        ? "This WordPress plan is on Mon, Wed, Fri delivery. Saving moves it to 5 days a week. The number of tiffins stays the same; upcoming deliveries are rescheduled onto the days below."
        : "Delivery days and the number of tiffins stay the same. Upcoming deliveries are rescheduled onto the new days, so the last delivery date moves."}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || unchanged || invalid != null} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      }
    >
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-1.5">
          {WEEK.map((d) => {
            const on = value.includes(d);
            const noDish = !servesWeekends && (d === "sat" || d === "sun");
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                disabled={noDish}
                title={noDish ? NO_WEEKEND_DISH : undefined}
                onClick={() => setValue(WEEK.filter((x) => (x === d ? !on : value.includes(x))))}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {cap(d)}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">Delivered on {deliveryDays.map(cap).join(", ")}.</p>
        {!servesWeekends && <p className="text-muted-foreground text-xs text-pretty">{NO_WEEKEND_DISH}.</p>}
        {combined.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {combined.map((t) => `${cap(t.day)} brings ${t.days.map(cap).join(" + ")}`).join(" · ")}
          </p>
        )}
        {(invalid && !unchanged) || error ? <p role="alert" className="text-destructive text-sm">{error ?? invalid}</p> : null}
      </div>
    </ResponsiveDialog>
  );
}
