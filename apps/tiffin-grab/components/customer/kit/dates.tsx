"use client";

import { Truck } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { cn, FONT, FOCUS, SPRING } from "./cn";
import { Reason } from "./notice";
import { StatusDot, StatusRing, STATUS_LABEL, type DeliveryStatus } from "./status";

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => fmt(new Date(parse(iso).getTime() + n * 864e5));
const WD = new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

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
  const d = parse(date);
  const label = LONG.format(d) + (delivery ? ", delivery day" : "") + (status ? `, ${STATUS_LABEL[status]}` : "") + (disabledReason ? `, unavailable: ${disabledReason}` : "");
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
        "relative flex flex-none flex-col items-center justify-center rounded-[14px] border-[1.5px] text-xs leading-tight [touch-action:manipulation] transition-[transform,background-color] duration-150 active:scale-[.97] motion-reduce:transition-none",
        SPRING,
        compact ? "size-11" : delivery !== undefined ? "h-[62px] min-w-11" : "h-[52px] min-w-11",
        selected ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "border-[var(--border)] bg-[var(--card)]",
        disabledReason && "opacity-35",
        className,
      )}
    >
      {!compact && <span aria-hidden>{WD.format(d)}</span>}
      <StatusRing status={status === "delivered" ? "delivered" : undefined} className={compact ? "size-8" : undefined}>
        <b aria-hidden className="text-[17px] tabular-nums">{d.getUTCDate()}</b>
      </StatusRing>
      {((status && status !== "delivered") || delivery) && (
        <span aria-hidden className="absolute bottom-1 flex items-center gap-0.5">
          {delivery && <Truck className="size-3 text-[var(--muted-foreground,#6E6558)]" />}
          {status && status !== "delivered" && <StatusDot decorative status={status} />}
        </span>
      )}
    </button>
  );
}

export interface StripDay {
  date: string;
  disabledReason?: string;
  status?: DeliveryStatus;
  delivery?: boolean;
}

interface StripProps {
  label: string;
  days: StripDay[];
  value: string | null;
  onChange: (date: string) => void;
  /** Seven-day weeks: cells share the width instead of scrolling. */
  fit?: boolean;
}

export function DateStrip({ label, days, value, onChange, fit }: StripProps) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <div>
      <div role="group" aria-label={label} className={fit ? "grid grid-cols-7 gap-1.5" : "flex gap-2 overflow-x-auto overscroll-x-contain pb-1"}>
        {days.map((d) => (
          <DateCell
            key={d.date}
            {...d}
            className={fit ? "w-full min-w-0" : undefined}
            selected={d.date === value}
            onSelect={(x) => (setReason(null), onChange(x))}
            onDisabledTap={setReason}
          />
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

interface GridProps {
  /** YYYY-MM */
  month: string;
  days?: Record<string, { status?: DeliveryStatus; disabledReason?: string }>;
  selected?: string | null;
  onSelect: (date: string) => void;
}

export function MonthGrid({ month, days = {}, selected, onSelect }: GridProps) {
  const first = `${month}-01`;
  const offset = (parse(first).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate();
  const all = Array.from({ length: count }, (_, i) => addDays(first, i));
  const [focus, setFocus] = useState(selected && selected.startsWith(month) ? selected : first);
  const [reason, setReason] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, iso: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDays(iso, step);
    if (!next.startsWith(month)) return;
    setFocus(next);
    refs.current[next]?.focus();
  };

  const cells: (string | null)[] = [...Array(offset).fill(null), ...all];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  return (
    <div>
      <div role="grid" aria-label={month} className="grid gap-1">
        <div role="row" className={cn(FONT, "grid grid-cols-7 text-center text-xs font-semibold text-[var(--muted-foreground,#6E6558)]")}>
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
