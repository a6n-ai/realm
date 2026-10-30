import Link from "next/link";
import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { browsePublishedWeek, type WeekScope } from "@/lib/menu/browse-published-week";
import { buildCustomerWeek, dietLegend, foldPicks, initialDay, planOf, popularSince, weekEnd } from "@/lib/menu/customer-week";
import { menuService } from "@/lib/services/menu.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myDeliveries } from "@/lib/services/customer-deliveries.service";
import { EmptyState, PageHeader } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { formatDateOnly } from "@/lib/format/datetime";
import { WeeklyMenu } from "@/components/customer/meals/weekly-menu";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  // Today is fixed here in the app timezone, so the client never reads the clock for it.
  const today = zonedDateIso(now, timezone);
  const want = (await searchParams).week === "next" ? "next" : "this";
  const { week, scope, scopes } = await browsePublishedWeek(now, timezone, want);

  if (!week) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Menu" title="Weekly" accent="menu." />
        <EmptyState
          icon={<UtensilsCrossed className="size-6" />}
          title="No menu released yet"
          body="The kitchen publishes each week's dishes ahead of time. Check back soon."
          action={<Link href="/me" className={buttonClass({ pill: true })}>Back to deliveries</Link>}
        />
      </div>
    );
  }

  const [mine, picks] = await Promise.all([
    myDeliveries(userId, week.weekStart, weekEnd(week.weekStart)),
    menuService.dishPickCounts(popularSince(week.weekStart)).then(foldPicks),
  ]);
  const plan = planOf(mine);
  const days = buildCustomerWeek(week, mine, today, now, null, picks);
  const planDays = plan ? buildCustomerWeek(week, mine, today, now, plan, picks) : null;
  const range = `${formatDateOnly(week.weekStart, { mode: "short" })} to ${formatDateOnly(weekEnd(week.weekStart), { mode: "short" })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={scope === "next" ? "Next week" : "This week"}
        title="Weekly"
        accent="menu."
        subtitle={range}
        action={scopes.length > 1 ? <WeekSwitch value={scope} /> : undefined}
      />
      <WeeklyMenu key={week.weekStart} days={days} plan={plan && planDays ? { name: plan, days: planDays } : null} legend={dietLegend(week.items)} initial={initialDay(days, today)} today={today} />
    </div>
  );
}

const WEEKS: { id: WeekScope; label: string; href: string }[] = [
  { id: "this", label: "This week", href: "/me/menu" },
  { id: "next", label: "Next week", href: "/me/menu?week=next" },
];

// Shown only once next week is released. Links, not a client toggle: each week is its own server render.
function WeekSwitch({ value }: { value: WeekScope }) {
  return (
    <nav aria-label="Menu week" className={cn(FONT, "flex gap-1 rounded-full bg-[var(--muted)] p-1")}>
      {WEEKS.map((w) => (
        <Link
          key={w.id}
          href={w.href}
          prefetch
          replace
          aria-current={w.id === value ? "page" : undefined}
          className={cn(
            FOCUS,
            "inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap [touch-action:manipulation] transition-colors duration-150 motion-reduce:transition-none",
            w.id === value
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "text-[var(--muted-foreground,#6E6558)] hover:bg-[var(--card)] hover:text-[var(--foreground)]",
          )}
        >
          {w.label}
        </Link>
      ))}
    </nav>
  );
}
