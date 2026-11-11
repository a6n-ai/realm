"use client";

import { useState } from "react";
import { CalendarClockIcon, CheckIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { daysBetween } from "@foundry/commons/util/dates";
import { Button } from "@foundry/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Alert, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { FollowUpPicker } from "@/components/dashboard/pipeline/follow-up-picker";
import { formatEpoch } from "@/lib/format/datetime";

function relativeDay(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Overdue → destructive badge, today → success badge, later → plain date plus a relative label. */
export function FollowUpValue({ next, dayStart, dayEnd, tz }: { next: number; dayStart: number; dayEnd: number; tz: string }) {
  const date = formatEpoch(next, { mode: "date", timeZone: tz });
  const rel = relativeDay(daysBetween(zonedDateIso(dayStart, tz), zonedDateIso(next, tz)));
  if (next < dayStart) return <Badge variant="destructive-light">Overdue · {date}</Badge>;
  if (next < dayEnd) return <Badge variant="success-light">Today · {date}</Badge>;
  return <span className="tabular-nums">{date} <span className="text-muted-foreground">({rel})</span></span>;
}

/** The one follow-up display on the lead page: scheduled → value + Reschedule; none → warning + Set follow-up. */
export function NextStepCard({ nextFollowUpAt, dayStart, dayEnd, tz, pending, onPick, onMarkDone }: {
  nextFollowUpAt: number | null;
  dayStart: number;
  dayEnd: number;
  tz: string;
  pending: boolean;
  onPick: (at: number) => void;
  onMarkDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const scheduled = nextFollowUpAt != null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Next step</CardTitle>
        <CardAction>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                <CalendarClockIcon className="text-muted-foreground" aria-hidden />
                {scheduled ? "Reschedule" : "Set follow-up"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-3">
              <FollowUpPicker
                timeZone={tz}
                value={null}
                onChange={(v) => {
                  if (!v) return;
                  onPick(v.at);
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </CardAction>
      </CardHeader>
      <CardContent>
        {scheduled ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="text-muted-foreground">Follow-up </span>
              <FollowUpValue next={nextFollowUpAt} dayStart={dayStart} dayEnd={dayEnd} tz={tz} />
            </p>
            <Button variant="ghost" size="sm" disabled={pending} onClick={onMarkDone}>
              <CheckIcon aria-hidden />
              Mark done
            </Button>
          </div>
        ) : (
          <Alert variant="warning">
            <AlertTitle>No follow-up scheduled</AlertTitle>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
