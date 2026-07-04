import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { eventPayout } from "@/db/schema";
import { PayoutGrid, PayoutGridSkeleton } from "../payout-grid";

export default function PayoutsPage() {
  return (
    <Suspense fallback={<PayoutGridSkeleton />}>
      <PayoutsData />
    </Suspense>
  );
}

async function PayoutsData() {
  await requireAdmin();

  const payouts = await db
    .select({
      eventType: eventPayout.eventType,
      enabled: eventPayout.enabled,
      coins: eventPayout.coins,
    })
    .from(eventPayout)
    .orderBy(eventPayout.eventType);

  return <PayoutGrid payouts={payouts} />;
}
