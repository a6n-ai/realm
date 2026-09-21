"use client";

import Link from "next/link";
import { Card, Skeleton } from "@/components/customer/kit";
import { cn, FOCUS, FONT } from "@/components/customer/kit/cn";
import { MealInfoChips, PlanBox, PlanHeadingRow } from "@/components/customer/plan-box";
import { formatDateOnly } from "@/lib/format/datetime";
import { formatCoversLabel } from "@/lib/menu/coverage";
import type { Subscription, TiffinCounts, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import { WaitlistCard } from "./waitlist-card";
import { RenewalCountdown } from "./renewal-countdown";

export type SubscriptionWithNext = Subscription & {
  nextDelivery: { deliveryDate: string; coversDates?: string[] | null } | null;
  daysUntilRenewal: number | null;
  tiffinCounts?: TiffinCounts | null;
};

const MUTED = "text-[var(--muted-foreground,#6E6558)]";
// Kit Button is a <button>; navigation needs anchors, so links borrow its look.
const LINK_BASE = cn(
  FONT,
  FOCUS,
  "inline-flex min-h-[44px] select-none items-center justify-center rounded-full border-[1.5px] px-[18px] text-[15px] font-semibold [touch-action:manipulation] transition-transform duration-150 active:scale-[.97] motion-reduce:transition-none",
);
const LINK_PRIMARY = cn(LINK_BASE, "min-h-[52px] w-full border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)]");
const LINK_QUIET = cn(LINK_BASE, "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]");

const WD: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

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
  const next = sub.nextDelivery;
  const covers = next?.coversDates && next.coversDates.length > 1 ? formatCoversLabel(next.coversDates) : null;
  const days = counts?.deliveryWeekdays.map((d) => WD[d] ?? d).join(", ");
  const tripHref = next ? `/me/deliveries?trip=${next.deliveryDate}` : "/me/deliveries";
  return (
    <PlanBox color={sub.tagColor} className="space-y-3">
      <PlanHeadingRow
        name={<p className="text-lg font-semibold leading-snug tracking-tight text-balance">{sub.mealSizeName}</p>}
        dietLabel={dietLabel}
        color={sub.tagColor}
        status={sub.status}
        trailing={
          sub.status === "active" && sub.daysUntilRenewal != null ? <RenewalCountdown daysLeft={sub.daysUntilRenewal} /> : null
        }
      />
      <MealInfoChips
        categoryCounts={sub.categoryCounts}
        categoryLabels={categoryLabels}
        categoryPortions={categoryPortions}
        persons={sub.persons}
      />
      <div className={cn("space-y-1 text-[13px] tabular-nums", MUTED)}>
        {days ? <p>Delivery days: {days}</p> : null}
        {next && (
          <p>
            Next delivery {formatDateOnly(next.deliveryDate)}
            {covers ? ` · covers meals for ${covers}` : ""}
          </p>
        )}
        {counts && (
          <p>
            {counts.remaining} of {counts.total} eating days left
            {counts.holdDays > 0 ? ` · ${counts.holdDays} on hold` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        <Link href="/me/deliveries" className={LINK_PRIMARY}>
          Manage deliveries
        </Link>
        <div className="grid grid-cols-3 gap-2.5">
          <Link href={tripHref} className={LINK_QUIET}>
            Pick meals
          </Link>
          <Link href="/me/deliveries" className={LINK_QUIET}>
            Vacation
          </Link>
          <Link href="/me/renew" className={LINK_QUIET}>
            Renew
          </Link>
        </div>
      </div>
    </PlanBox>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold tracking-[-0.02em]">Your plan</h2>
        <p className={cn("text-[13px]", MUTED)}>Status, remaining tiffins, and vacation.</p>
      </div>
      {children}
    </Card>
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
    <Section>
      {subscriptions.length > 0 ? (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <SubscriptionCard key={sub.publicId} sub={sub} categoryLabels={categoryLabels} categoryPortions={categoryPortions} />
          ))}
        </div>
      ) : waitlisted.length > 0 ? (
        <div className="space-y-3">
          {waitlisted.map((sub) => (
            <WaitlistCard key={sub.publicId} sub={sub} />
          ))}
        </div>
      ) : (
        <div className="space-y-3 py-2 text-center">
          <p className={cn("text-sm", MUTED)}>No active subscriptions yet.</p>
          <Link href="/subscribe" className={cn(LINK_PRIMARY, "sm:w-auto")}>
            Browse plans
          </Link>
        </div>
      )}
    </Section>
  );
}

export function SubscriptionSectionSkeleton() {
  return (
    <Section>
      <Skeleton className="h-64 w-full rounded-3xl" />
    </Section>
  );
}
