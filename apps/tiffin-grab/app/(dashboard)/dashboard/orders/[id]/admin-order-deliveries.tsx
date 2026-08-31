"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DeliveryCalendar, type DeliveryCardData, type PausePanel } from "@/app/(customer)/me/deliveries/delivery-calendar";
import type { CalendarCell } from "@/app/(customer)/me/deliveries/calendar-constants";
import type { Subscription, TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { fetchOrderDeliveriesMonth } from "./actions";

type Bundle = {
  deliveries: DeliveryCardData[];
  pausePanels: Record<string, PausePanel>;
  calendarCells: Record<string, CalendarCell[]>;
  categoryLabels: Record<string, string>;
  categoryPortions: Record<string, string>;
  tiffinCounts: TiffinCounts;
  monthKey: string;
  today: string;
};

export function AdminOrderDeliveries({
  initial,
  subscription,
  waitlisted,
  basePath,
}: {
  initial: Bundle;
  subscription: Subscription;
  waitlisted: Parameters<typeof DeliveryCalendar>[0]["waitlisted"];
  basePath: string;
}) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onMonthChange(monthKey: string) {
    startTransition(async () => {
      const next = await fetchOrderDeliveriesMonth(subscription.publicId, monthKey);
      setBundle(next as Bundle);
    });
  }

  function onChanged() {
    startTransition(async () => {
      const next = await fetchOrderDeliveriesMonth(subscription.publicId, bundle.monthKey);
      setBundle(next as Bundle);
      router.refresh();
    });
  }

  return (
    <div className={pending ? "pointer-events-none opacity-70 transition-opacity" : undefined}>
      <DeliveryCalendar
        subscriptions={[subscription]}
        selectedPublicId={subscription.publicId}
        deliveries={bundle.deliveries}
        pausePanels={bundle.pausePanels}
        calendarCells={bundle.calendarCells}
        categoryLabels={bundle.categoryLabels}
        categoryPortions={bundle.categoryPortions}
        monthKey={bundle.monthKey}
        waitlisted={waitlisted}
        today={bundle.today}
        tiffinCounts={bundle.tiffinCounts}
        basePath={basePath}
        showHeader={false}
        showBrowsePlans={false}
        onMonthChange={onMonthChange}
        onDeliveriesChanged={onChanged}
      />
    </div>
  );
}
