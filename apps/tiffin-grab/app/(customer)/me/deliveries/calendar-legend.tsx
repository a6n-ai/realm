import { cn } from "@realm/ui/cn";
import {
  CALENDAR_LEGEND,
  calendarLegendKey,
  LEGEND_MARK_CLASS,
  type CalendarLegendKey,
  type DayStatus,
} from "./day-status";

/** Shared size for tile marks and the legend so the key is a 1:1 map of the calendar. */
export const STATUS_MARK_CLASS = "h-2.5 w-3.5 shrink-0 rounded-full";

export function StatusMark({
  legendKey,
  className,
}: {
  legendKey: CalendarLegendKey;
  className?: string;
}) {
  return <span className={cn(STATUS_MARK_CLASS, LEGEND_MARK_CLASS[legendKey], className)} aria-hidden />;
}

export function DayStatusMark({ status, className }: { status: DayStatus; className?: string }) {
  const key = calendarLegendKey(status);
  if (!key) return <span className={cn(STATUS_MARK_CLASS, "bg-transparent", className)} aria-hidden />;
  return <StatusMark legendKey={key} className={className} />;
}

export function CalendarLegend({ className }: { className?: string }) {
  return (
    <ul
      className={className ?? "flex w-full flex-nowrap items-center justify-between gap-2 overflow-x-auto text-[11px] font-medium whitespace-nowrap text-foreground sm:gap-4 sm:text-xs"}
      aria-label="Delivery status"
    >
      {CALENDAR_LEGEND.map((item) => (
        <li key={item.key} className="inline-flex shrink-0 items-center gap-1.5">
          <StatusMark legendKey={item.key} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
