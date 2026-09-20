import Link from "next/link";
import { Button, Card, Pill } from "@/components/customer/kit";
import { FONT } from "@/components/customer/kit/cn";
import type { WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";

export function NoPlan({ waitlisted }: { waitlisted: WaitlistedSubscription[] }) {
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
      {waitlisted.length === 0 && (
        <Card className="p-6">
          <p className="text-[17px] font-semibold">No plan running.</p>
          <p className="mb-4 mt-1 text-sm text-[var(--muted-foreground,#6E6558)]">Start one and your trips will show up here.</p>
          <Link href="/subscribe"><Button variant="primary" size="lg">Start a plan</Button></Link>
        </Card>
      )}
    </div>
  );
}
