import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { eventPayout } from "@/db/schema";
import { PayoutGrid } from "../payout-grid";

export default async function PayoutsPage() {
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
