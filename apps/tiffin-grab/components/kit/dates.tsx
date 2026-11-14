"use client";

import { Truck } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { cn, FONT, FOCUS, SPRING } from "./cn";
import { DATE_LONG, WEEKDAY_SHORT } from "./date-formats";
import { Reason } from "./notice";
import { StatusDot, StatusRing } from "./status";
import { STATUS_LABEL, type DeliveryStatus } from "@/lib/deliveries/status";
import { addDaysIso, isoToUtcDate, mondayIndex } from "@foundry/commons/util/dates";


interface DateCellProps {
  date: string;
  selected?: boolean;
  disabledReason?: string;
  status?: DeliveryStatus;
  onSelect: (date: string) => void;
  /** Called on tap of a disabled cell so the parent can surface the reason. */
  onDisabledTap?: (reason: string) => void;
  tabIndex?: number;
  compact?: boolean;
  /** Marks a delivery day with a small truck. */
  delivery?: boolean;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}

export function DateCell({ date, selected, disabledReason, status, onSelect, onDisabledTap, tabIndex, compact, delivery, className, onKeyDown, buttonRef }: DateCellProps) {
  const d = isoToUtcDate(date);
  const label = DATE_LONG.format(d) + (delivery ? ", delivery day" : "") + (status ? `, ${STATUS_LABEL[status]}` : "") + (disabledReason ? `, unavailable: ${disabledReason}` : "");
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-pressed={selected}
      aria-disabled={disabledReason ? true : undefined}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onClick={() => (disabledReason ? onDisabledTap?.(disabledReason) : onSelect(date))}
      className={cn(
        FONT,
        FOCUS,
        "relative flex flex-none flex-col items-center justify-center rounded-[14px] text-xs leading-tight [touch-action:manipulation] transition-[transform,background-color] duration-150 active:scale-[.97] motion-reduce:transition-none",
        SPRING,
        compact ? "size-11" : delivery !== undefined ? "h-[62px] min-w-11" : "h-[52px] min-w-11",
        selected
          ? "c-surface bg-primary text-[var(--primary-foreground,#fff)]"
          : "c-surface bg-card hover:ring-[1.5px] hover:ring-primary hover:-translate-y-0.5 motion-reduce:transform-none",
        disabledReason && "opacity-35",
        className,
      )}
    >
      {!compact && <span aria-hidden>{WEEKDAY_SHORT.format(d)}</span>}
      <StatusRing status={status === "delivered" ? "delivered" : undefined} className={compact ? "size-8" : undefined}>
        <b aria-hidden className="text-body tabular-nums">{d.getUTCDate()}</b>
      </StatusRing>
      {((status && status !== "delivered") || delivery) && (
        <span aria-hidden className="absolute bottom-1 flex items-center gap-0.5">
          {delivery && <Truck className={cn("size-3", selected ? "text-current" : "text-primary")} />}
          {status && status !== "delivered" && <StatusDot decorative status={status} />}
        </span>
      )}
    </button>
  );
}

interface GridProps {
  /** YYYY-MM */
  month: string;
  days?: Record<string, { status?: DeliveryStatus; disabledReason?: string }>;
  selected?: string | null;
  onSelect: (date: string) => void;
}

export function MonthGrid({ month, days = {}, selected, onSelect }: GridProps) {
  const first = `${month}-01`;
  const offset = mondayIndex(first);
  const count = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate();
  const all = Array.from({ length: count }, (_, i) => addDaysIso(first, i));
  const [focus, setFocus] = useState(selected && selected.startsWith(month) ? selected : first);
  const [reason, setReason] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, iso: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDaysIso(iso, step);
    if (!next.startsWith(month)) return;
    setFocus(next);
    refs.current[next]?.focus();
  };

  const cells: (string | null)[] = [...Array(offset).fill(null), ...all];
  // Always six rows, so paging months never resizes the sheet around the grid.
  while (cells.length < 42) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  return (
    <div>
      <div role="grid" aria-label={month} className="grid gap-1">
        <div role="row" className={cn(FONT, "grid grid-cols-7 text-center text-xs font-semibold text-[var(--muted-foreground)]")}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
            <span key={w} role="columnheader">{w}</span>
          ))}
        </div>
        {rows.map((row, r) => (
          <div key={r} role="row" className="grid grid-cols-7 justify-items-center gap-1">
            {row.map((iso, c) =>
              iso ? (
                <div key={iso} role="gridcell">
                  <DateCell
                    compact
                    date={iso}
                    {...days[iso]}
                    selected={iso === selected}
                    tabIndex={iso === focus ? 0 : -1}
                    buttonRef={(el) => {
                      refs.current[iso] = el;
                    }}
                    onKeyDown={(e) => onKey(e, iso)}
                    onSelect={(x) => (setFocus(x), setReason(null), onSelect(x))}
                    onDisabledTap={(rs) => (setFocus(iso), setReason(rs))}
                  />
                </div>
              ) : (
                <div key={`e${c}`} role="gridcell" aria-hidden />
              ),
            )}
          </div>
        ))}
      </div>
      {reason && (
        <div role="status" className="mt-2">
          <Reason>{reason}</Reason>
        </div>
      )}
    </div>
  );
}
