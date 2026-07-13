"use client";

import { Lottie } from "@/components/motion";
import { Card } from "@/components/ds";
import type { WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";

export function WaitlistCard({ sub }: { sub: WaitlistedSubscription }) {
  const waitlisted = sub.status === "waitlisted";
  return (
    <Card variant="flat" className="flex flex-col items-center gap-3 p-6 text-center">
      <Lottie src="/lottie/delivery-scooter.json" mode="loop" label={waitlisted ? "On the waitlist" : "Processing"} className="size-32" />
      <p className="text-base font-semibold">{waitlisted ? "You're on the waitlist" : "Processing your subscription…"}</p>
      <p className="text-muted-foreground text-sm">
        {sub.planName} · {sub.mealSizeName} · {sub.daysPerWeek} days/week
      </p>
      <p className="text-muted-foreground text-xs">
        {sub.postalCode}{waitlisted ? " — not served yet" : ""}
      </p>
      {waitlisted ? (
        <p className="text-muted-foreground text-sm">We'll email you when we reach your area.</p>
      ) : null}
    </Card>
  );
}
