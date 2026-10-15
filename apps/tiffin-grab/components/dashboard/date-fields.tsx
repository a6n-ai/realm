"use client";

import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Calendar } from "@foundry/ui/calendar";
import { cn } from "@foundry/ui/cn";
import { Input } from "@foundry/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { useIsMobile } from "@foundry/ui/use-mobile";
import { TimePicker } from "@/components/reui/time-picker";
import { formatDateOnly } from "@/lib/format/datetime";

// Phones keep the native control: its OS sheet beats any popover at that size. Desktop
// gets the ReUI/shadcn pickers. Every field speaks the same string the native input does
// (YYYY-MM-DD, HH:mm, YYYY-MM-DDTHH:mm, YYYY-MM), so callers swap in without conversions.

type FieldProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  title?: string;
  "aria-label"?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso?: string) => (iso ? new Date(`${iso}T00:00:00`) : undefined);

function NativeInput({ type, value, onChange, id, disabled, className, min, max, title, ...rest }: FieldProps & {
  type: "date" | "time" | "datetime-local" | "month";
  min?: string;
  max?: string;
}) {
  return (
    <Input
      id={id} type={type} min={min} max={max} value={value} disabled={disabled} title={title}
      aria-label={rest["aria-label"]} className={className}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DateInput({
  value, onChange, min, max, clearable, id, disabled, className, title, placeholder = "Pick a date", ...rest
}: FieldProps & { min?: string; max?: string; clearable?: boolean }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (isMobile) {
    return <NativeInput type="date" {...{ value, onChange, min, max, id, disabled, className, title }} aria-label={rest["aria-label"]} />;
  }
  const selected = fromIso(value);
  const disabledDays = [
    ...(min ? [{ before: fromIso(min)! }] : []),
    ...(max ? [{ after: fromIso(max)! }] : []),
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id} type="button" variant="outline" disabled={disabled} aria-label={rest["aria-label"]} title={title}
          className={cn("justify-start gap-2 font-normal tabular-nums", !value && "text-muted-foreground", className)}
        >
          <CalendarIcon className="text-muted-foreground size-4" />
          {value ? formatDateOnly(value, { mode: "weekday" }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? fromIso(min)}
          disabled={disabledDays}
          onSelect={(d) => {
            if (d) onChange(toIso(d));
            setOpen(false);
          }}
          autoFocus
        />
        {clearable && value ? (
          <div className="flex justify-end border-t p-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(""); setOpen(false); }}>
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function TimeInput({ value, onChange, id, disabled, className, placeholder, ...rest }: FieldProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <NativeInput type="time" {...{ value, onChange, id, disabled, className }} aria-label={rest["aria-label"]} />;
  }
  return (
    <TimePicker
      id={id} value={value || null} disabled={disabled} placeholder={placeholder}
      aria-label={rest["aria-label"]} className={className}
      onValueChange={(v) => onChange(v ?? "")}
    />
  );
}

export function DateTimeInput({
  value, onChange, id, disabled, className, clearable, ...rest
}: FieldProps & { clearable?: boolean }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <NativeInput type="datetime-local" {...{ value, onChange, id, disabled, className }} aria-label={rest["aria-label"]} />;
  }
  const [date = "", time = ""] = value ? value.split("T") : [];
  return (
    <div className={cn("flex gap-2", className)}>
      <DateInput
        id={id} value={date} disabled={disabled} clearable={clearable}
        aria-label={rest["aria-label"]} className="flex-1"
        onChange={(d) => onChange(d ? `${d}T${time || "00:00"}` : "")}
      />
      <TimePicker
        value={time || null} disabled={disabled || !date} placeholder="Time"
        aria-label={rest["aria-label"] ? `${rest["aria-label"]} time` : "Time"}
        onValueChange={(t) => onChange(`${date}T${t ?? "00:00"}`)}
      />
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthInput({ value, onChange, id, disabled, className, placeholder = "Pick a month", ...rest }: FieldProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [y, m] = value ? value.split("-").map(Number) : [new Date().getFullYear(), 0];
  const [year, setYear] = useState(y);
  if (isMobile) {
    return <NativeInput type="month" {...{ value, onChange, id, disabled, className }} aria-label={rest["aria-label"]} />;
  }
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setYear(y); }}>
      <PopoverTrigger asChild>
        <Button
          id={id} type="button" variant="outline" disabled={disabled} aria-label={rest["aria-label"]}
          className={cn("justify-start gap-2 font-normal tabular-nums", !value && "text-muted-foreground", className)}
        >
          <CalendarIcon className="text-muted-foreground size-4" />
          {value ? `${MONTHS[m - 1]} ${y}` : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-64 flex-col gap-2 p-2" align="start">
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" aria-label="Previous year" onClick={() => setYear(year - 1)}>
            <ChevronLeftIcon />
          </Button>
          <span className="text-sm font-medium tabular-nums">{year}</span>
          <Button type="button" variant="ghost" size="icon" aria-label="Next year" onClick={() => setYear(year + 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((label, i) => (
            <Button
              key={label} type="button" size="sm"
              variant={value && year === y && i + 1 === m ? "default" : "ghost"}
              onClick={() => { onChange(`${year}-${pad(i + 1)}`); setOpen(false); }}
            >
              {label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
