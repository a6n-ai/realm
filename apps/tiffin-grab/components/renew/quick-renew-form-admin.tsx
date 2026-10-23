"use client";

import { useState } from "react";
import { CalendarIcon, MinusIcon, PlusIcon } from "lucide-react";
import { formatAddress } from "@foundry/address/ui";
import { Button } from "@foundry/ui/button";
import { Calendar } from "@foundry/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { Label } from "@foundry/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Skeleton } from "@foundry/ui/skeleton";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { formatDateOnly } from "@/lib/format/datetime";
import { useQuickRenew, type QuickRenewProps } from "./use-quick-renew";

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Staff shell of quick renew: installed @foundry/ui + ReUI parts, semantic tokens, no customer kit. */
export function QuickRenewFormAdmin(props: QuickRenewProps & { tagLabel: string | null }) {
  const q = useQuickRenew(props);
  const { sel, set, catalog, price } = q;
  const [dateOpen, setDateOpen] = useState(false);
  const diet = props.tagLabel || q.plan?.name;
  const qtyFor = (key: string) => sel.addonSelections?.find((s) => s.key === key)?.qty ?? 0;
  const setQty = (key: string, qty: number) =>
    set({ addonSelections: [...(sel.addonSelections ?? []).filter((s) => s.key !== key), ...(qty > 0 ? [{ key, qty }] : [])] });

  return (
    <div className="flex flex-col gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {q.meal?.name ?? "Plan"}
            {diet && <Badge variant="secondary">{diet}</Badge>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{(sel.eatingDays ?? []).map((d) => DAY_LABEL[d] ?? d).join(", ")}</p>
        </CardHeader>
      </Card>

      <div className="flex flex-col gap-2">
        <Label htmlFor="renew-start-date">Start date</Label>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button id="renew-start-date" variant="outline" className="w-56 justify-start font-normal tabular-nums">
              <CalendarIcon data-icon="inline-start" />
              {sel.startDate ? formatDateOnly(sel.startDate) : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={sel.startDate ? new Date(`${sel.startDate}T00:00:00`) : undefined}
              defaultMonth={sel.startDate ? new Date(`${sel.startDate}T00:00:00`) : undefined}
              disabled={(d) => q.dayDisabledReason(toIso(d)) !== undefined}
              onSelect={(d) => { if (d) { q.onStartDate(toIso(d)); setDateOpen(false); } }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        {q.dateError ? (
          <p role="alert" className="text-xs text-destructive">{q.dateError}</p>
        ) : q.keptDefault ? (
          <p className="text-xs text-muted-foreground">Starts right after the current plan ends</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label id="renew-weeks">Weeks</Label>
        <RadioGroup aria-labelledby="renew-weeks" className="grid-cols-4 gap-2" value={String(sel.durationWeeks)} onValueChange={(v) => set({ durationWeeks: Number(v) })}>
          {[...catalog.durations].sort((a, b) => a.weeks - b.weeks).map((d) => (
            <Label key={d.weeks} htmlFor={`renew-w${d.weeks}`} className="flex items-center gap-2 font-normal">
              <RadioGroupItem id={`renew-w${d.weeks}`} value={String(d.weeks)} aria-label={`${d.weeks} weeks`} />
              {d.weeks}wk
            </Label>
          ))}
        </RadioGroup>
      </div>

      {q.addons.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Add to every tiffin</Label>
          <ul className="flex flex-col gap-2">
            {q.addons.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex flex-col">
                  {a.name}{a.portion ? ` · ${a.portion}` : ""}
                  <span className="text-xs text-muted-foreground tabular-nums">+${a.pricePerTiffin.toFixed(2)} per tiffin</span>
                </span>
                <span className="flex items-center gap-2">
                  <Button variant="outline" size="icon-sm" aria-label={`Remove ${a.name}`} disabled={qtyFor(a.key) === 0} onClick={() => setQty(a.key, qtyFor(a.key) - 1)}><MinusIcon /></Button>
                  <span className="w-4 text-center tabular-nums">{qtyFor(a.key)}</span>
                  <Button variant="outline" size="icon-sm" aria-label={`Add ${a.name}`} disabled={qtyFor(a.key) >= a.maxQty} onClick={() => setQty(a.key, qtyFor(a.key) + 1)}><PlusIcon /></Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label id="renew-address">Deliver to</Label>
        {props.savedAddresses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved address.</p>
        ) : (
          <RadioGroup aria-labelledby="renew-address" value={q.addressId ?? ""} onValueChange={q.setAddressId}>
            {props.savedAddresses.map((a) => (
              <Label key={a.publicId} htmlFor={`renew-a-${a.publicId}`} className="flex items-start gap-2 font-normal">
                <RadioGroupItem id={`renew-a-${a.publicId}`} value={a.publicId} aria-label={a.label} />
                <span className="flex flex-col">
                  <span className="font-medium">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{formatAddress(a)}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        )}
      </div>

      {q.submitError && <Alert variant="destructive"><AlertDescription>{q.submitError}</AlertDescription></Alert>}

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background pt-3">
        {price.loading ? (
          <Skeleton className="h-6 w-24" />
        ) : price.error ? (
          <span role="alert" className="flex items-center gap-2 text-sm text-destructive">
            {price.error}
            <Button size="sm" variant="outline" onClick={q.retry}>Retry</Button>
          </span>
        ) : (
          <span className="text-sm font-semibold tabular-nums" aria-label={`Total $${price.result!.total.toFixed(2)}`}>${price.result!.total.toFixed(2)}</span>
        )}
        <Button disabled={!q.canSubmit} onClick={q.submit}>{props.submitLabel}</Button>
      </div>
    </div>
  );
}
