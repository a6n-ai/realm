"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDaysIcon, MapPinIcon, PauseIcon, PencilIcon, PlayIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, CardContent, EmptyState, PageHeader, ResponsiveDialog, SkeletonListRows } from "@/components/ds";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import type { CustomerActivity, CustomerDelivery, Subscription, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import type { ResolvedCategory } from "@/lib/menu/resolve-delivery-meal";
import { WaitlistCard } from "@/components/customer/home/waitlist-card";
import { DeliveryHistory } from "./delivery-history";
import {
  clearMyDeliveryAddress,
  pauseMySubscription,
  resumeMySubscription,
  setMyDeliveryAddress,
  skipMyDelivery,
  unskipMyDelivery,
} from "./actions";
import { MAX_EXTRA_WINDOWS, STATUS_LABEL, STATUS_TONE, SUB_STATUS_LABEL, TONE_CLASS, WINDOW_DAYS, type DeliveryStatus } from "./calendar-constants";

type Address = { fullName: string; addressLine: string; city: string; postalCode: string };

export type DeliveryCardData = CustomerDelivery & {
  meal: ResolvedCategory[] | { pending: true };
  address: Address;
  hasAddressOverride: boolean;
};

// One chip per distinct dish in a resolved category, "{count}× {dish}" — a category's `picks`
// can repeat the same dish (fixed categories) or vary per unit (selectable ones), so dedupe by
// name rather than rendering one chip per pick.
function mealChips(meal: DeliveryCardData["meal"]): string[] {
  if ("pending" in meal) return [];
  const chips: string[] = [];
  for (const cat of meal) {
    const counts = new Map<string, number>();
    for (const p of cat.picks) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    for (const [name, n] of counts) chips.push(`${n}× ${name}`);
  }
  return chips;
}

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[STATUS_TONE[status]])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function ChangeAddressDialog({
  deliveryPublicId,
  address,
  disabled,
  onSaved,
}: {
  deliveryPublicId: string;
  address: Address;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [fullName, setFullName] = useState(address.fullName);
  const [addressLine, setAddressLine] = useState(address.addressLine);
  const [city, setCity] = useState(address.city);
  const [postalCode, setPostalCode] = useState(address.postalCode);

  function save() {
    start(async () => {
      try {
        await setMyDeliveryAddress(deliveryPublicId, { fullName, addressLine, city, postalCode });
        setOpen(false);
        onSaved();
        toast.success("Address updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update address");
      }
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm" disabled={disabled}>
          <PencilIcon data-icon="inline-start" /> Change address
        </Button>
      }
      title="Change delivery address"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending} onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3 px-4 pb-4 sm:px-0 sm:pb-0">
        <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input placeholder="Address line" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
        <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input placeholder="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
      </div>
    </ResponsiveDialog>
  );
}

function DeliveryCard({ d, tz, pending, run }: {
  d: DeliveryCardData;
  tz: string;
  pending: boolean;
  run: (fn: () => Promise<void>, successMsg?: string) => void;
}) {
  const locked = Date.now() > d.cutoffAt;
  const chips = mealChips(d.meal);

  return (
    <Card variant="flat" className={cn("p-4", (locked || d.status === "skipped") && "opacity-70")}>
      <CardContent className="space-y-3 p-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{formatDateOnly(d.deliveryDate, { mode: "weekday" })}</p>
            <p className="text-muted-foreground text-xs">{d.planName}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {d.isMakeup && <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">Make-up</span>}
            <StatusBadge status={d.status as DeliveryStatus} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {"pending" in d.meal ? (
            <span className="text-muted-foreground text-xs">Menu not published yet</span>
          ) : chips.length === 0 ? (
            <span className="text-muted-foreground text-xs">Nothing scheduled</span>
          ) : (
            chips.map((c, i) => (
              <span key={i} className="bg-muted rounded-full px-2 py-0.5 text-xs">{c}</span>
            ))
          )}
        </div>

        <div className="flex items-start gap-1.5 text-xs">
          <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            {d.address.fullName} · {d.address.addressLine}, {d.address.city} {d.address.postalCode}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {d.status === "scheduled" && (
            <ChangeAddressDialog
              deliveryPublicId={d.publicId}
              address={d.address}
              disabled={pending || locked}
              onSaved={() => run(() => Promise.resolve())}
            />
          )}
          {d.status === "scheduled" && d.hasAddressOverride && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || locked}
              onClick={() => run(() => clearMyDeliveryAddress(d.publicId), "Address reset to default")}
            >
              Use default
            </Button>
          )}

          {!d.isMakeup && d.status === "scheduled" && !locked && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => skipMyDelivery(d.publicId), "Delivery skipped")}
            >
              Skip
            </Button>
          )}
          {!d.isMakeup && d.status === "scheduled" && locked && (
            <span className="text-muted-foreground text-xs" title="Past cutoff — locked">
              Cutoff passed {formatEpoch(d.cutoffAt, { mode: "datetime", timeZone: tz })}
            </span>
          )}
          {!d.isMakeup && d.status === "skipped" && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => unskipMyDelivery(d.publicId), "Delivery restored")}
            >
              Un-skip
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PauseRangeControl({ sub, pending, run }: {
  sub: Subscription;
  pending: boolean;
  run: (fn: () => Promise<void>, successMsg?: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");

  if (sub.status === "paused") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => resumeMySubscription(sub.publicId), "Subscription resumed")}
      >
        <PlayIcon data-icon="inline-start" /> Resume
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-lg border bg-transparent px-2 text-sm" />
      <span className="text-muted-foreground text-xs">to</span>
      <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8 rounded-lg border bg-transparent px-2 text-sm" />
      <Button
        variant="secondary"
        size="sm"
        disabled={pending || !from || !until}
        onClick={() => run(() => pauseMySubscription(sub.publicId, { from, until }), "Subscription paused")}
      >
        <PauseIcon data-icon="inline-start" /> Pause range
      </Button>
    </div>
  );
}

function SubscriptionSection({ sub, deliveries, tz, pending, run }: {
  sub: Subscription;
  deliveries: DeliveryCardData[];
  tz: string;
  pending: boolean;
  run: (fn: () => Promise<void>, successMsg?: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{sub.planName}</h2>
          <span className="text-muted-foreground text-xs">{SUB_STATUS_LABEL[sub.status as "active" | "paused"]}</span>
        </div>
        <PauseRangeControl sub={sub} pending={pending} run={run} />
      </div>
      {deliveries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No deliveries in this window.</p>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d) => (
            <DeliveryCard key={d.publicId} d={d} tz={tz} pending={pending} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}

export function DeliveryCalendar({
  subscriptions,
  deliveries,
  extraWindows,
  waitlisted = [],
  history = [],
  activity = [],
  today = "",
}: {
  subscriptions: Subscription[];
  deliveries: DeliveryCardData[];
  extraWindows: number;
  waitlisted?: WaitlistedSubscription[];
  history?: CustomerDelivery[];
  activity?: CustomerActivity[];
  today?: string;
}) {
  const tz = useTimezone();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>, successMsg?: string) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        if (successMsg) toast.success(successMsg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  function loadMore() {
    const params = new URLSearchParams(window.location.search);
    params.set("days", String(extraWindows + 1));
    router.push(`?${params.toString()}`);
  }

  if (subscriptions.length === 0) {
    return (
      <div className="space-y-6 p-4">
        <div className="space-y-3">
          {waitlisted.length > 0 ? (
            waitlisted.map((s) => <WaitlistCard key={s.publicId} sub={s} />)
          ) : (
            <EmptyState
              icon={CalendarDaysIcon}
              message="No active subscriptions yet."
              action={
                <Button asChild size="sm">
                  <Link href="/subscribe">Browse plans</Link>
                </Button>
              }
            />
          )}
        </div>
        <DeliveryHistory history={history} activity={activity} today={today} />
      </div>
    );
  }

  const bySub = new Map<string, DeliveryCardData[]>(subscriptions.map((s) => [s.publicId, []]));
  for (const d of deliveries) {
    const list = bySub.get(d.orderPublicId);
    if (list) list.push(d);
  }

  return (
    <div className="space-y-6 p-4">
      <PageHeader icon={CalendarDaysIcon} title="My deliveries" />
      {subscriptions.map((sub) => (
        <SubscriptionSection
          key={sub.publicId}
          sub={sub}
          deliveries={bySub.get(sub.publicId) ?? []}
          tz={tz}
          pending={pending}
          run={run}
        />
      ))}
      <Button
        variant="outline"
        className="w-full"
        disabled={pending || extraWindows >= MAX_EXTRA_WINDOWS}
        onClick={loadMore}
      >
        Load more ({WINDOW_DAYS} days)
      </Button>
      <DeliveryHistory history={history} activity={activity} today={today} />
    </div>
  );
}

// Exact loading twin: named export, not DeliveryCalendar.Skeleton — page.tsx is a Server
// Component and cannot dot into this "use client" module.
export function DeliveryCalendarSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-7 w-40" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <SkeletonListRows rows={3} />
        </div>
      ))}
    </div>
  );
}
