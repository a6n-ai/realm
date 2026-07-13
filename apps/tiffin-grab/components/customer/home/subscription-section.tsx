"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageIcon, PauseIcon, PlayIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, EmptyState, SectionCard } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { CustomerDelivery, Subscription, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import { pauseMySubscription, resumeMySubscription } from "@/app/(customer)/me/deliveries/actions";
import { SUB_STATUS_LABEL, TONE_CLASS } from "@/app/(customer)/me/deliveries/calendar-constants";
import { PlanHero } from "./plan-hero";
import { WaitlistCard } from "./waitlist-card";

// M1: myActiveSubscriptions returns plan/status/address only (no mealSizeId, meal-items, or
// price) — this card renders plan, status, and next-delivery date ONLY. Do not add meal chips
// or a price line here without first extending the underlying select.
export type SubscriptionWithNext = Subscription & { nextDelivery: CustomerDelivery | null };

function StatusPill({ status }: { status: "active" | "paused" }) {
  const tone = status === "active" ? "ok" : "warn";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[tone])}>
      {SUB_STATUS_LABEL[status]}
    </span>
  );
}

function PauseResumeControl({ sub, pending, run }: {
  sub: SubscriptionWithNext;
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
      <input
        aria-label="Pause from"
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="h-8 rounded-lg border bg-transparent px-2 text-sm"
      />
      <span className="text-muted-foreground text-xs">to</span>
      <input
        aria-label="Pause until"
        type="date"
        value={until}
        onChange={(e) => setUntil(e.target.value)}
        className="h-8 rounded-lg border bg-transparent px-2 text-sm"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending || !from || !until}
        onClick={() => run(() => pauseMySubscription(sub.publicId, { from, until }), "Subscription paused")}
      >
        <PauseIcon data-icon="inline-start" /> Pause
      </Button>
    </div>
  );
}

function SubscriptionCard({ sub }: { sub: SubscriptionWithNext }) {
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

  return (
    <Card variant="flat" className="space-y-0 overflow-hidden p-0">
      <PlanHero planKey={sub.planKey} planType={sub.planType} />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{sub.planName}</p>
            {sub.nextDelivery && (
              <p className="text-muted-foreground text-xs">Next delivery {formatDateOnly(sub.nextDelivery.deliveryDate)}</p>
            )}
          </div>
          <StatusPill status={sub.status as "active" | "paused"} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/me/deliveries">Manage</Link>
          </Button>
          <PauseResumeControl sub={sub} pending={pending} run={run} />
        </div>
      </div>
    </Card>
  );
}

export function SubscriptionSection({
  subscriptions,
  waitlisted = [],
}: {
  subscriptions: SubscriptionWithNext[];
  waitlisted?: WaitlistedSubscription[];
}) {
  return (
    <SectionCard title="Your subscription">
      {subscriptions.length > 0 ? (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <SubscriptionCard key={sub.publicId} sub={sub} />
          ))}
        </div>
      ) : waitlisted.length > 0 ? (
        <div className="space-y-3">
          {waitlisted.map((sub) => (
            <WaitlistCard key={sub.publicId} sub={sub} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={PackageIcon}
          message="No active subscriptions yet."
          action={
            <Button asChild size="sm">
              <Link href="/subscribe">Browse plans</Link>
            </Button>
          }
        />
      )}
    </SectionCard>
  );
}

// Exact loading twin: named export, not SubscriptionSection.Skeleton — a Server Component
// cannot dot into this "use client" module's export (the /dashboard/orders bug).
export function SubscriptionSectionSkeleton() {
  return (
    <SectionCard title="Your subscription">
      <div className="space-y-3">
        <Skeleton className="h-52 w-full rounded-lg" />
      </div>
    </SectionCard>
  );
}
