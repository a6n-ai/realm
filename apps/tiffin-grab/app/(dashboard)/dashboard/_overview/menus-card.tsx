import Link from "next/link";
import { CalendarDaysIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ChartCard } from "@/components/analytics/chart-card";
import { Badge } from "@/components/reui/badge";
import { addDays, mondayOf } from "@/lib/deliveries-view/week";
import { menuService } from "@/lib/services/menu.service";
import { FooterLink } from "./footer-link";

const STATE = {
  released: { label: "Released", variant: "success-light" },
  ready: { label: "Ready, not released", variant: "warning-light" },
  draft: { label: "Draft", variant: "warning-light" },
  missing: { label: "Not started", variant: "destructive-light" },
} as const;

const weekLabel = (monday: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${monday}T12:00:00Z`));

/** This week's and next week's menu: is each released, so customers can pick and the kitchen can plan? */
export async function MenusCard({ today }: { today: string }) {
  const weeks = await menuService.listWeeks();
  const thisMonday = mondayOf(today);
  const rows = [
    { key: "this", title: "This week", monday: thisMonday },
    { key: "next", title: "Next week", monday: addDays(thisMonday, 7) },
  ].map((r) => {
    const w = weeks.find((x) => x.weekStart === r.monday);
    const state = w ? (w.status as keyof typeof STATE) : "missing";
    return { ...r, week: w, state };
  });
  return (
    <ChartCard title="Weekly menus" subtitle="Released weeks are what customers pick from">
      <ul className="flex flex-col divide-y">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <CalendarDaysIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {r.title} · {weekLabel(r.monday)}
              </div>
              <div className="text-muted-foreground truncate text-xs">{r.week ? `${r.week.itemCount} dishes` : "no menu yet"}</div>
            </div>
            <Badge variant={STATE[r.state].variant}>{STATE[r.state].label}</Badge>
            {r.state !== "released" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={r.week ? `/dashboard/menus/${r.week.publicId}` : "/dashboard/menus"}>{r.week ? "Open" : "Create"}</Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <FooterLink href="/dashboard/menus">Weekly menus</FooterLink>
    </ChartCard>
  );
}
