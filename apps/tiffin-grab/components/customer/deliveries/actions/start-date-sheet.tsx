"use client";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton, MonthGrid } from "@/components/kit";
import { NETWORK_CLIENT_ERROR, sanitizeClientError } from "@foundry/commons/util/client-error";
import { changeMyStartDate } from "@/lib/deliveries/customer-actions";
import type { CustomerStartChange } from "@/lib/orders/orders.service";
import { humanDate } from "@/lib/deliveries/view";
import { KIT_UI } from "./sheet-ui";

const MUTED = "text-[var(--muted-foreground)]";
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const weekdayOf = (iso: string) => DAY_KEYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;

function shiftMonth(month: string, by: number): string {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Customer picks a new first day. The server re-checks every rule (cutoff, start days, holidays, other plans). */
export function StartDateSheet({ orderId, change, open, onDone }: {
  orderId: string;
  change: CustomerStartChange;
  open: boolean;
  onDone: (message?: string) => void;
}) {
  const { Shell, PrimaryButton, Notice, Reason } = KIT_UI;
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState((change.startDate > change.minDate ? change.startDate : change.minDate).slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const count = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const days: Record<string, { disabledReason?: string }> = {};
  for (let i = 1; i <= count; i++) {
    const iso = `${month}-${String(i).padStart(2, "0")}`;
    if (iso < change.minDate) days[iso] = { disabledReason: "Not available yet" };
    else if (change.closedDates.includes(iso)) days[iso] = { disabledReason: "We're closed this day" };
    else if (change.allowedDays.length && !change.allowedDays.includes(weekdayOf(iso))) days[iso] = { disabledReason: "Plans can't start on this day" };
  }

  const save = () => start(async () => {
    if (!picked) return;
    setError(null);
    try {
      const res = await changeMyStartDate(orderId, picked);
      if ("error" in res) return setError(sanitizeClientError(res.error));
      onDone(`Your plan now starts ${humanDate(picked)}.`);
    } catch {
      setError(NETWORK_CLIENT_ERROR);
    }
  });

  return (
    <Shell
      open={open}
      onClose={() => onDone()}
      title="Change start date"
      footer={
        <>
          {error && <Notice tone="error">{error}</Notice>}
          <PrimaryButton pending={pending} disabledReason={!picked ? "Pick a day" : picked === change.startDate ? "That's your current start" : undefined} onClick={save}>
            {picked ? `Start ${humanDate(picked)}` : "Save"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <p className={`text-subhead ${MUTED}`}>
          {`Now starting ${humanDate(change.startDate)}. Pick a new first day. Your tiffin count stays the same, and paused days stay paused if they're still on your schedule.`}
        </p>
        <div className="flex items-center justify-between">
          <IconButton aria-label="Previous month" tip="Previous month" disabled={month <= change.minDate.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden className="size-5" />
          </IconButton>
          <p className="text-subhead font-semibold">
            {new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}
          </p>
          <IconButton aria-label="Next month" tip="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight aria-hidden className="size-5" />
          </IconButton>
        </div>
        <MonthGrid key={month} month={month} days={days} selected={picked ?? change.startDate} onSelect={setPicked} />
        <Reason>Changing it after your first day&apos;s cutoff isn&apos;t possible.</Reason>
      </div>
    </Shell>
  );
}
