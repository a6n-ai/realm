"use client";

import Link from "next/link";
import { PackageIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { EmptyState, SectionCard } from "@/components/ds";
import { IOS_BUTTON } from "@/components/customer/ios-button";
import { MealInfoChips, PlanBox, PlanHeadingRow } from "@/components/customer/plan-box";
import { formatDateOnly } from "@/lib/format/datetime";
import type { Subscription, TiffinCounts, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import { WaitlistCard } from "./waitlist-card";
import { RenewalCountdown } from "./renewal-countdown";

export type SubscriptionWithNext = Subscription & {
  nextDelivery: { deliveryDate: string } | null;
  daysUntilRenewal: number | null;
  tiffinCounts?: TiffinCounts | null;
};

function SubscriptionCard({
  sub,
  categoryLabels,
  categoryPortions,
}: {
  sub: SubscriptionWithNext;
  categoryLabels: Record<string, string>;
  categoryPortions: Record<string, string>;
}) {
  const counts = sub.tiffinCounts;
  const dietLabel = sub.tagLabel || sub.planName;
  return (
    <PlanBox color={sub.tagColor} className="space-y-3">
      <PlanHeadingRow
        name={<p className="text-lg font-semibold leading-snug tracking-tight text-balance">{sub.mealSizeName}</p>}
        dietLabel={dietLabel}
        color={sub.tagColor}
        status={sub.status}
        trailing={
          sub.status === "active" && sub.daysUntilRenewal != null ? (
            <RenewalCountdown daysLeft={sub.daysUntilRenewal} />
          ) : null
        }
      />
      <MealInfoChips
        categoryCounts={sub.categoryCounts}
        categoryLabels={categoryLabels}
        categoryPortions={categoryPortions}
        persons={sub.persons}
      />
      {sub.nextDelivery && (
        <p className="text-muted-foreground text-xs">
          Next delivery {formatDateOnly(sub.nextDelivery.deliveryDate)}
        </p>
      )}
      {counts && (
        <p className="text-muted-foreground text-xs tabular-nums">
          {counts.remaining} of {counts.total} tiffins left
          {counts.holdDays > 0 ? ` · ${counts.holdDays} hold` : ""}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <Button asChild className={IOS_BUTTON}>
          <Link href="/me/deliveries">Manage</Link>
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          <Button asChild variant="secondary" className={IOS_BUTTON}>
            <Link href="/me/renew">Renew plan</Link>
          </Button>
          <Button asChild variant="secondary" className={IOS_BUTTON}>
            <Link href="/me/deliveries">Vacation</Link>
          </Button>
        </div>
      </div>
    </PlanBox>
  );
}

export function SubscriptionSection({
  subscriptions,
  waitlisted = [],
  categoryLabels = {},
  categoryPortions = {},
}: {
  subscriptions: SubscriptionWithNext[];
  waitlisted?: WaitlistedSubscription[];
  categoryLabels?: Record<string, string>;
  categoryPortions?: Record<string, string>;
}) {
  return (
    <SectionCard title="Your plan" subtitle="Status, remaining tiffins, and vacation.">
      {subscriptions.length > 0 ? (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <SubscriptionCard
              key={sub.publicId}
              sub={sub}
              categoryLabels={categoryLabels}
              categoryPortions={categoryPortions}
            />
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
            <Button asChild className={IOS_BUTTON}>
              <Link href="/subscribe">Browse plans</Link>
            </Button>
          }
        />
      )}
    </SectionCard>
  );
}

export function SubscriptionSectionSkeleton() {
  return (
    <SectionCard title="Your plan" subtitle="Status, remaining tiffins, and vacation.">
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    </SectionCard>
  );
}
