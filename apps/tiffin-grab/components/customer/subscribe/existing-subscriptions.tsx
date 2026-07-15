"use client";

import { OrderStatusBadge } from "@/components/ds";
import { Reveal } from "@/components/motion";
import type { SubSummary } from "@/lib/services/customer-deliveries.service";

const CURRENT = new Set(["active", "paused", "waitlisted", "pending"]);

function Group({ title, subs }: { title: string; subs: SubSummary[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <Reveal.Group className="divide-y">
        {subs.map((s) => (
          <Reveal key={s.publicId} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-sm">{s.planName} · {s.mealSizeName} · {s.daysPerWeek} days/wk</span>
            <OrderStatusBadge status={s.status} />
          </Reveal>
        ))}
      </Reveal.Group>
    </section>
  );
}

export function ExistingSubscriptions({ subs }: { subs: SubSummary[] }) {
  if (subs.length === 0) return null;
  const current = subs.filter((s) => CURRENT.has(s.status));
  const past = subs.filter((s) => !CURRENT.has(s.status));
  return (
    <div className="space-y-4">
      {current.length > 0 && <Group title="You already have" subs={current} />}
      {past.length > 0 && <Group title="Past subscriptions" subs={past} />}
    </div>
  );
}
