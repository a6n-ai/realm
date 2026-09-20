"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, DateStrip, Skeleton, StatusDot, STATUS_LABEL, type DeliveryStatus, type StripDay } from "@/components/customer/kit";
import { buildDayStatusMap, type Trip } from "@/lib/deliveries-view";

const DOT: Record<string, DeliveryStatus> = { delivered: "delivered", upcoming: "upcoming", vacation: "vacation", onHold: "hold" };
const LEGEND: DeliveryStatus[] = ["upcoming", "delivered", "hold", "vacation", "combined"];

function addDays(iso: string, n: number) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
}

export function HomeWeekStrip({ trips, todayIso }: { trips: Trip[]; todayIso: string }) {
  const router = useRouter();
  const byDate = buildDayStatusMap(trips);
  const days: StripDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(todayIso, i);
    const e = byDate[date];
    if (!e) return { date, disabledReason: "No delivery this day" };
    return { date, status: e.legend ? DOT[e.legend] : "combined" };
  });

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.02em]">This week</h2>
          <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Tap a day to open that trip.</p>
        </div>
        <Link href="/me/deliveries" className="min-h-11 content-center text-sm font-semibold text-[var(--primary)]">
          Full calendar
        </Link>
      </div>
      <DateStrip
        fit
        label="Next 7 days"
        days={days}
        value={todayIso}
        onChange={(date) => router.push(`/me/deliveries?trip=${date}`)}
      />
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--muted-foreground,#6E6558)]">
        {LEGEND.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <StatusDot decorative status={s} />
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function HomeWeekStripEmpty() {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold tracking-[-0.02em]">This week</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground,#6E6558)]">No deliveries scheduled yet. Start a plan to see your week here.</p>
      <Link href="/subscribe" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--primary)]">
        Browse plans →
      </Link>
    </Card>
  );
}

export function HomeWeekStripSkeleton() {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold tracking-[-0.02em]">This week</h2>
        <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Tap a day to open that trip.</p>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-[52px] rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-4 w-56" />
    </Card>
  );
}
