"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Info, Truck, Utensils } from "lucide-react";
import { AddressFields as FoundryAddressFields } from "@foundry/ui/address-fields";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { ResponsiveDialog, Tabs, TabsList, TabsTrigger } from "@/components/ds";
import type { SheetUi } from "@/components/customer/deliveries/actions/sheet-ui";
import type { RowChoice } from "@/components/customer/deliveries/actions/choice-row";
import { DeliveryAreaNote, useDeliveryArea } from "@/components/customer/address/delivery-area";
import { addDays, weekDays } from "@/lib/deliveries-view/week";

// The delivery action sheets (Edit meal, Move, Change address) drawn in the CRM's shadcn
// language. Every rule and server call stays in the shared sheets; this file is look only.

const MON = new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const WD = ["M", "T", "W", "T", "F", "S", "S"];
export const STATUS_TONE: Record<string, string> = {
  delivered: "bg-emerald-500", upcoming: "bg-sky-500", vacation: "bg-amber-500", hold: "bg-rose-500", combined: "bg-muted-foreground",
};

function ChoiceRow({
  label,
  hint,
  choices,
  value,
  onChange,
  nested = false,
  children,
}: {
  label: string;
  hint?: string;
  choices: RowChoice[];
  value: string;
  onChange: (value: string) => void;
  nested?: boolean;
  children?: ReactNode;
}) {
  const [why, setWhy] = useState<string | null>(null);
  const shown = choices.find((c) => c.value === why && c.reason);
  return (
    <div className={nested ? "ml-3 grid gap-2 border-l-2 pl-3" : "grid gap-2"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={nested ? "text-muted-foreground text-xs font-medium" : "text-sm font-medium"}>{label}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
        {choices.map((c) => {
          const on = c.value === value;
          return (
            <div key={c.value} className="relative">
              <button
                type="button"
                role="radio"
                aria-checked={on}
                disabled={c.disabled}
                onClick={() => !on && onChange(c.value)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  on ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/60",
                  c.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                  c.reason && "pr-9",
                )}
              >
                <span className={cn("size-3.5 shrink-0 rounded-full border", on && "border-primary border-4")} aria-hidden />
                <span className="min-w-0 flex-1 leading-snug">{c.label}</span>
              </button>
              {c.reason && (
                <button
                  type="button"
                  aria-label={`Why ${c.label} is unavailable`}
                  aria-expanded={why === c.value}
                  onClick={() => setWhy((w) => (w === c.value ? null : c.value))}
                  className="text-destructive absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full"
                >
                  <Info aria-hidden className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {shown && (
        <p role="status" className="text-destructive text-xs font-medium text-pretty">
          {shown.label}: {shown.reason}
        </p>
      )}
      {children}
    </div>
  );
}

// ponytail: one week at a time with arrows (the sheets only use the picker mode); the hub keeps its own two-week strip.
const WeekStrip: SheetUi["WeekStrip"] = ({ firstWeek, lastWeek, week, today, selectedDay, dots, onPickDay, onWeek, picker }) => (
  <div className="rounded-md border p-2" data-testid="move-week">
    <div className="mb-1 flex items-center justify-between">
      <span className="text-muted-foreground px-1 text-xs font-semibold tracking-wider uppercase">
        {MON.format(d(week))} {d(week).getUTCDate()} – {MON.format(d(addDays(week, 6)))} {d(addDays(week, 6)).getUTCDate()}
      </span>
      <span className="flex">
        <Button variant="ghost" size="icon" aria-label="Previous week" disabled={week <= firstWeek} onClick={() => onWeek(addDays(week, -7))}><ChevronLeft /></Button>
        <Button variant="ghost" size="icon" aria-label="Next week" disabled={week >= lastWeek} onClick={() => onWeek(addDays(week, 7))}><ChevronRight /></Button>
      </span>
    </div>
    <div className="grid grid-cols-7 gap-1">
      {weekDays(week).map((iso, i) => {
        const off = picker?.isDisabled(iso) ?? false;
        const ds = dots[iso] ?? [];
        const truck = ds.some((x) => x.truck);
        const sel = iso === selectedDay;
        return (
          <button
            key={iso}
            type="button"
            aria-pressed={sel}
            aria-disabled={off || undefined}
            aria-label={`${d(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}${truck ? ", delivery day" : ""}${off ? ", unavailable" : ""}`}
            onClick={() => (off ? picker?.onDisabledTap?.(iso) : onPickDay(iso))}
            className={cn(
              "flex h-[72px] flex-col items-center justify-center gap-1 rounded-md border text-xs",
              sel ? "border-primary bg-primary/10 font-semibold" : "border-transparent",
              off ? "opacity-40" : "hover:bg-muted",
              iso === today && !sel && "ring-primary ring-1",
            )}
          >
            <span aria-hidden className="text-muted-foreground grid w-full grid-cols-[1fr_auto_1fr] items-center px-1">
              <span className="flex justify-end">{ds.some((x) => x.status) && <Utensils className="size-2.5" />}</span>
              <span className="px-1">{WD[i]}</span>
              <span className="flex justify-start">{truck && <Truck className="size-2.5" />}</span>
            </span>
            <b className="text-sm tabular-nums">{d(iso).getUTCDate()}</b>
            <span className="flex h-3 items-center gap-0.5">
              {ds.map((x, k) => x.status && <span key={k} aria-hidden className={cn("size-2 rounded-full", STATUS_TONE[x.status])} />)}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export const ADMIN_SHEET_UI: SheetUi = {
  Shell: ({ open, onClose, title, footer, children }) => (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Same choices the customer sees. Saved as the staff member."
      contentClassName="sm:max-w-2xl"
      footer={footer}
    >
      {children}
    </ResponsiveDialog>
  ),
  PrimaryButton: ({ pending, disabled, disabledReason, onClick, children }) => (
    <div className="flex w-full items-center justify-end gap-3">
      {disabledReason && <span className="text-muted-foreground mr-auto text-xs">{disabledReason}</span>}
      <Button disabled={disabled || !!disabledReason || pending} onClick={onClick}>{pending ? "Saving…" : children}</Button>
    </div>
  ),
  Notice: ({ tone = "info", children }) => (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-3 py-2 text-sm", tone === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/50")}
    >
      {children}
    </div>
  ),
  Reason: ({ children }) => (
    <p className="text-muted-foreground flex items-start gap-2 text-sm">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  ),
  Loading: () => (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading menu">
      <Skeleton className="h-9 w-48" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  ),
  Segmented: ({ label, value, onChange, items }) => (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList aria-label={label}>
        {items.map((it) => (
          <TabsTrigger key={it.id} value={it.id}>{it.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  ),
  ChoiceRow,
  CategorySection: ({ label, children }) => (
    <section aria-label={label} className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</h4>
      <div className="grid gap-4">{children}</div>
    </section>
  ),
  WeekStrip,
  OptionCard: ({ selected, className, children, type = "button", ...rest }) => (
    <button
      {...rest}
      type={type}
      aria-checked={rest.role === "radio" ? selected : undefined}
      aria-pressed={rest.role === "radio" ? undefined : selected}
      className={cn(
        "w-full rounded-lg border text-left text-sm transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  ),
  PillToggle: ({ on, className, children, type = "button", ...rest }) => (
    <button
      {...rest}
      type={type}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
        on ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
        // The kit sizes pills with its own type scale; keep the CRM's.
        "text-sm sm:text-sm",
      )}
    >
      {children}
    </button>
  ),
  Field: function Field({ label, error, onChange, ...rest }) {
    const id = useId();
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} aria-invalid={!!error || undefined} onChange={onChange} {...rest} />
        {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
      </div>
    );
  },
  AddressFields: function AddressFields({ checkArea = true, className, ...props }) {
    const area = useDeliveryArea(checkArea ? props.values.postalCode : null);
    return (
      <div className="grid gap-2">
        <FoundryAddressFields {...props} className={cn("gap-4", className)} />
        <DeliveryAreaNote area={area} />
      </div>
    );
  },
};
