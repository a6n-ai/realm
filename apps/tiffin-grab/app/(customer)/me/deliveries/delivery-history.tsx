"use client";

import { Reveal } from "@/components/motion";
import { deliveryDisplayStatus } from "@/lib/deliveries/display-status";
import { describeActivity } from "@/lib/services/order-activity-describe";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerDelivery, CustomerActivity } from "@/lib/services/customer-deliveries.service";

export function DeliveryHistory({
  history, activity, today,
}: { history: CustomerDelivery[]; activity: CustomerActivity[]; today: string }) {
  const tz = useTimezone();
  if (history.length === 0 && activity.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No past deliveries yet.</p>;
  }
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">History</h2>
      {history.length ? (
        <Reveal.Group className="divide-y">
          {history.map((d) => (
            <Reveal key={d.publicId} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{d.deliveryDate} · {d.planName}</span>
              <span className="text-muted-foreground text-xs">{deliveryDisplayStatus(d.status, d.deliveryDate, today)}</span>
            </Reveal>
          ))}
        </Reveal.Group>
      ) : null}
      {activity.length ? (
        <div className="divide-y">
          {activity.map((a) => (
            <div key={a.publicId} className="flex items-center justify-between py-2">
              <span className="text-sm">{describeActivity(a)}</span>
              <span className="text-muted-foreground text-xs">{formatEpoch(a.createdAt, { mode: "datetime", timeZone: tz })}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
