import { ChartColumnIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ds";
import { StatCards, type StatCardItem } from "@/components/dashboard/stat-cards";
import { requirePagePermission } from "@/lib/auth/guards";

// Demo only: sample numbers, so the layout can be judged before it is wired to analytics.
const ITEMS: StatCardItem[] = [
  { label: "Orders", period: "Last 7 days", value: "124", hint: "Orders placed", compareLabel: "previous 7 days", delta: { now: 124, before: 110, good: "up" } },
  { label: "Net revenue", period: "Last 12 days", value: "$12.4K", hint: "After refunds, ex tax", compareLabel: "previous 12 days", delta: { now: 88, before: 107, good: "up" } },
  { label: "Net profit", period: "Last month", value: "$3.1K", hint: "Revenue minus food and delivery cost", compareLabel: "month before", delta: { now: 31, before: 27, good: "up" } },
  { label: "Active subscriptions", period: "Last year", value: "175", hint: "Plans running today", compareLabel: "a year ago", delta: { now: 175, before: 150, good: "up" } },
  { label: "Trial to plan", period: "Last 30 days", value: "38%", hint: "Trials that bought a plan", compareLabel: "previous 30 days", delta: { now: 38, before: 50, good: "up" } },
];

export default async function StatsDemoPage() {
  await requirePagePermission({ settings: ["read"] });
  return (
    <PageShell>
      <PageHeader icon={ChartColumnIcon} title="Stat cards demo" subtitle="Sample numbers. One card, a cell per metric." />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">One card, numbers only</h2>
        <StatCards items={ITEMS} />
      </section>
    </PageShell>
  );
}
