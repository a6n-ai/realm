import { Lottie } from "@/components/motion";
import { Card } from "@/components/customer/kit";
import type { WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";

export function WaitlistCard({ sub }: { sub: WaitlistedSubscription }) {
  const waitlisted = sub.status === "waitlisted";
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      <Lottie src="/lottie/delivery-scooter.json" mode="loop" label={waitlisted ? "On the waitlist" : "Processing"} className="size-32" />
      <p className="text-base font-semibold">{waitlisted ? "You're on the waitlist" : "Processing your subscription…"}</p>
      <p className="text-[var(--muted-foreground,#6E6558)] text-sm">
        {sub.planName} · {sub.mealSizeName} · {sub.daysPerWeek} delivery days/week
      </p>
      <p className="text-[var(--muted-foreground,#6E6558)] text-xs">
        {sub.postalCode}{waitlisted ? " — not served yet" : ""}
      </p>
      {waitlisted ? (
        <p className="text-[var(--muted-foreground,#6E6558)] text-sm">We&apos;ll email you when we reach your area.</p>
      ) : null}
    </Card>
  );
}
