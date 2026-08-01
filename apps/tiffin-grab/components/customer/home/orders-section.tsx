"use client";

import Link from "next/link";
import { ReceiptTextIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { EmptyState, SectionCard } from "@/components/ds";
import type { SubSummary } from "@/lib/services/customer-deliveries.service";
import { ExistingSubscriptions } from "@/components/customer/subscribe/existing-subscriptions";

const TITLE = "Your orders";
const SUBTITLE = "Everything you've ordered — ongoing first, past below.";

export function OrdersSection({ subs }: { subs: SubSummary[] }) {
  return (
    <SectionCard title={TITLE} subtitle={SUBTITLE}>
      {subs.length > 0 ? (
        <ExistingSubscriptions subs={subs} />
      ) : (
        <EmptyState
          icon={ReceiptTextIcon}
          message="No orders yet."
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

// Named export, not OrdersSection.Skeleton — a Server Component cannot dot into
// this "use client" module's export. Same trap as SubscriptionSectionSkeleton.
export function OrdersSectionSkeleton() {
  return (
    <SectionCard title={TITLE} subtitle={SUBTITLE}>
      <Skeleton className="h-40 w-full rounded-lg" />
    </SectionCard>
  );
}
