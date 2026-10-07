import Link from "next/link";
import { Button, Card, Pill } from "@/components/customer/kit";
import { FONT } from "@/components/customer/kit/cn";
import type { EndedPlan, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function NoPlan({ waitlisted, ended }: { waitlisted: WaitlistedSubscription[]; ended: EndedPlan | null }) {
  return (
    <div className={`${FONT} space-y-4`}>
      <header className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">Deliveries</p>
        <h1 className="mt-1 text-[clamp(28px,5vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]">Your <em className="text-[var(--primary)]">trips.</em></h1>
      </header>
      {waitlisted.map((s) => (
        <Card key={s.publicId} className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-[15px] font-semibold">{s.mealSizeName} · {s.planName}</p>
            <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">{s.daysPerWeek} days a week · deliveries appear once your order is confirmed</p>
          </div>
          <Pill tone="vac">{s.status === "pending" ? "Pending" : "Waitlisted"}</Pill>
        </Card>
      ))}
      {waitlisted.length === 0 && ended && <EndedPlanCard plan={ended} />}
      {waitlisted.length === 0 && !ended && (
        <Card className="p-6">
          <p className="text-[17px] font-semibold">No plan running.</p>
          <p className="mb-4 mt-1 text-sm text-[var(--muted-foreground,#6E6558)]">Start one and your trips will show up here.</p>
          <Link href="/subscribe"><Button variant="primary" size="lg">Start a plan</Button></Link>
        </Card>
      )}
    </div>
  );
}

function EndedPlanCard({ plan }: { plan: EndedPlan }) {
  const over = plan.status === "completed";
  const last = plan.deliveredDates.at(-1);
  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[17px] font-semibold">{plan.mealSizeName}</p>
        <Pill tone="neutral" size="sm">{plan.planName}</Pill>
        <Pill tone={over ? "ok" : "neutral"} size="sm">{over ? "Plan over" : "Plan closed"}</Pill>
      </div>
      <div>
        <p className="text-[15px] font-semibold">
          {over ? "Your plan is over." : "Your plan was closed."}
        </p>
        <p className="mt-1 text-sm text-[var(--muted-foreground,#6E6558)]">
          {over
            ? `Every tiffin on it has been delivered${last ? `, the last one on ${shortDate(last)}` : ""}. Nothing more is scheduled.`
            : `${plan.delivered} tiffin${plan.delivered === 1 ? " was" : "s were"} delivered before it closed. Nothing more is scheduled.`}
        </p>
      </div>
      {plan.corrected && (
        <p className="rounded-[14px] bg-[var(--muted)] p-3 text-[13px] leading-relaxed">
          This plan moved over from our old website. Our old system kept delivering in late September,
          but those tiffins were not taken off your old balance. We have now counted them, which is why
          your plan ended sooner than the old balance showed.
        </p>
      )}
      <div>
        <p className="c-label mb-2">Delivered</p>
        <div className="flex flex-wrap gap-1.5">
          {plan.deliveredDates.map((d) => <Pill key={d} tone="ok" size="sm">{shortDate(d)}</Pill>)}
        </div>
      </div>
      <Link href="/me/renew"><Button variant="primary" size="lg">Renew my plan</Button></Link>
    </Card>
  );
}
