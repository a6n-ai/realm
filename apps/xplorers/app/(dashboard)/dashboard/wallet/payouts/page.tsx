import { EventPayoutGrid } from "@foundry/crm";
import { db } from "@/db/client";
import { eventPayout } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { EVENT_LABELS, PAYOUT_EVENTS, walletService } from "@/lib/services/wallet.service";
import { savePayoutAction } from "../actions";

const DESCRIPTIONS: Record<(typeof PAYOUT_EVENTS)[number], string> = {
  signup: "Once per family, when they create an account.",
  booking_paid: "Each booking, when staff verify its payment (or a discount makes it free).",
  first_booking: "A family's first paid booking only.",
  birthday_booking: "A paid booking for a Birthday class.",
};

export default async function WalletPayoutsPage() {
  await requirePermission({ wallet: ["read"] });
  await walletService.ensurePayoutRows();
  const rows = await db.select().from(eventPayout);
  const byEvent = new Map(rows.map((r) => [r.eventType, r]));
  return (
    <EventPayoutGrid
      rows={PAYOUT_EVENTS.map((event) => ({
        event,
        label: EVENT_LABELS[event],
        description: DESCRIPTIONS[event],
        enabled: byEvent.get(event)?.enabled ?? false,
        coins: byEvent.get(event)?.coins ?? 0,
      }))}
      onSave={savePayoutAction}
    />
  );
}
