import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronRightIcon,
  DollarSignIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  PackageIcon,
  SparklesIcon,
  UserIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { Role, formatMoney as fmt, zonedDateIso } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getCustomerDashboard } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { coversAllOrgs, getTodayCounts, getTodayQueue } from "@/lib/services/today.service";
import { OVERVIEW_KINDS, isTodayKind, type TodayKind } from "@/lib/today/types";
import { formatEpoch } from "@/lib/format/datetime";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import {
  PageShell,
  PageHeader,
  StatGrid,
  SectionCard,
  Card,
  ListRow,
  EmptyState,
  OrderStatusBadge,
  ORDER_STATUS_LABEL,
  PageSkeleton,
  DataTableSkeleton,
  type FacetDef,
} from "@/components/ds";
import { mondayOf, parseWeekParam } from "@/lib/deliveries-view/week";
import { GlanceCard } from "./_overview/glance-card";
import { ServiceCard } from "./_overview/service-card";
import { NeedsActionCard } from "./_overview/needs-action-card";
import { RouteCard } from "./_overview/route-card";
import { LanesCard } from "./_overview/lanes-card";
import { MenusCard } from "./_overview/menus-card";
import { CookingCard } from "./_overview/cooking-card";
import { KitchenWeekCard } from "./_overview/kitchen-week-card";
import { TodayQueue } from "./_overview/today-queue";

type SearchParams = Promise<Record<string, string | undefined>>;

// The page shell returns synchronously (no top-level await), so `loading.tsx`
// never fires — instead the role gate and each data region stream into their own
// <Suspense> with a skeleton that mirrors the resolved component.
export default function DashboardOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" stats={4} columns={5} action={false} />}>
      <DashboardData searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardData({ searchParams }: { searchParams: SearchParams }) {
  // Staff-only: the overview exposes business-wide stats and customer PII.
  // Customers landing here are sent to their account page.
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) {
    return <CustomerDashboard userId={session.user.id} />;
  }
  return <StaffOverview searchParams={searchParams} session={session} />;
}

async function StaffOverview({ searchParams, session }: { searchParams: SearchParams; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }) {
  await requireStaff();
  const visible = await resolveSessionVisibleOrgIds(session);
  const isAdmin = session.user.role === Role.ADMIN;
  const { type, week } = await searchParams;
  const activeType = isTodayKind(type) ? type : null;
  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const today = zonedDateIso(now, timezone);

  const seesAll = await coversAllOrgs(visible);
  const weekStart = parseWeekParam(week) ?? mondayOf(today);

  if (visible !== "all" && visible.length === 0) {
    return (
      <PageShell>
        <PageHeader icon={LayoutDashboardIcon} title="Overview" subtitle="What is waiting on us today." />
        <Alert variant="destructive">
          <AlertTitle>No franchise access</AlertTitle>
          <AlertDescription>
            Your account isn&apos;t linked to any franchise, so there is nothing to show. Ask an admin to add you to a
            franchise.
          </AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader icon={LayoutDashboardIcon} title="Overview" subtitle="What is waiting on us today." />

      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <GlanceCard visible={visible} today={today} now={now} />
      </Suspense>

      {/* Act first: what needs doing, how today is going, the menus to release. */}
      <CardGrid
        cards={[
          { key: "action", node: <NeedsActionCard visible={visible} today={today} seesAll={seesAll} isAdmin={isAdmin} />, h: 260 },
          seesAll && { key: "service", node: <ServiceCard today={today} />, h: 260 },
          // Menu pages are admin-only, so the menu card is too.
          isAdmin && { key: "menus", node: <MenusCard today={today} />, h: 200 },
        ]}
      />

      <div id="queue">
        <SectionCard title="Waiting on us" subtitle="Most urgent first. Verify a payment here; every other row opens its record.">
          <Suspense fallback={<DataTableSkeleton columns={QUEUE_SKELETON_COLUMNS} rows={6} serial={false} />}>
            <TodayQueueSection visible={visible} today={today} now={now} activeType={activeType} />
          </Suspense>
        </SectionCard>
      </div>

      {/* Then dispatch and kitchen: tomorrow's route, drivers, what to cook. */}
      <CardGrid
        cards={[
          seesAll && { key: "route", node: <RouteCard today={today} />, h: 260 },
          seesAll && { key: "lanes", node: <LanesCard today={today} />, h: 260 },
          seesAll && { key: "cooking", node: <CookingCard today={today} />, h: 260 },
        ]}
      />

      <Suspense fallback={<ChartSkeleton height={260} />}>
        <KitchenWeekCard visible={visible} monday={weekStart} thisMonday={mondayOf(today)} />
      </Suspense>

    </PageShell>
  );
}

type GridCard = { key: string; node: React.ReactNode; h: number };

/**
 * Cards fill the row: auto-fit columns of at least 20rem, so two cards share the width a third
 * would have used (no empty cell when a card renders nothing, e.g. Tomorrow's route without OptimoRoute).
 */
function CardGrid({ cards }: { cards: (GridCard | false)[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
      {cards.filter((c): c is GridCard => Boolean(c)).map((c) => (
        <Suspense key={c.key} fallback={<ChartSkeleton height={c.h} />}>
          {c.node}
        </Suspense>
      ))}
    </div>
  );
}

const QUEUE_SKELETON_COLUMNS = [
  { key: "type", label: "Type" },
  { key: "who", label: "Who" },
  { key: "what", label: "What" },
  { key: "since", label: "Waiting since" },
  { key: "action", label: "Action", align: "right" },
] as const;

async function TodayQueueSection({ visible, today, now, activeType }: { visible: "all" | string[]; today: string; now: number; activeType: TodayKind | null }) {
  const [counts, queue] = await Promise.all([
    getTodayCounts(visible, today),
    getTodayQueue(visible, now, activeType ? [activeType] : undefined),
  ]);
  // Pills are quick filters: each carries the exact total; picking one filters on the server before the 50 cap.
  const pills = OVERVIEW_KINDS.map((k) => ({ kind: k, count: counts.byKind[k] }));
  return <TodayQueue rows={queue.items} now={now} pills={pills} failed={queue.failed} activeType={activeType} />;
}

const CUSTOMER_LINKS = [
  {
    href: "/dashboard/meals",
    title: "My meals",
    description: "See this week's menu and what's arriving at your door.",
    icon: UtensilsCrossedIcon,
  },
  {
    href: "/dashboard/account",
    title: "Account",
    description: "Delivery address and notifications.",
    icon: UserIcon,
  },
] as const;

// startDate is a calendar date (YYYY-MM-DD) with no time-of-day, so it carries no
// TZ offset of its own. Render it at noon UTC formatted in the delivery (Canada)
// timezone so it never slips to the previous/next day across a DST boundary.
function formatDeliveryDate(iso: string, timeZone: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "short", day: "numeric", timeZone,
  }).format(Date.UTC(y, m - 1, d, 12));
}

// Short label for the delivery timezone (e.g. "EDT") so customer-facing dates are
// unambiguously stamped in Canada local time, not the viewer's locale.
function zoneAbbrev(timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-CA", { timeZone, timeZoneName: "short" })
    .formatToParts(Date.now())
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

function QuickLinks() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CUSTOMER_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="group rounded-xl" prefetch={false}>
          <Card className="flex h-full items-start justify-between gap-4 p-5 transition-colors group-hover:border-foreground/20">
            <div className="flex items-start gap-3">
              <link.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <h2 className="text-base font-semibold">{link.title}</h2>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">{link.description}</p>
              </div>
            </div>
            <ChevronRightIcon
              className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Card>
        </Link>
      ))}
    </div>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium${mono ? " font-mono" : " nums"}`}>{value}</dd>
    </div>
  );
}

async function CustomerDashboard({ userId }: { userId: string }) {
  const [data, settings] = await Promise.all([getCustomerDashboard(userId), getAppSettings()]);
  const tz = settings.timezone;
  const firstName = data.profile.name?.trim().split(/\s+/)[0];
  const { current } = data;
  // A cancelled order is terminal, not a live subscription: don't advertise it on the
  // lifetime card or render it as the current plan. active/paused/waitlisted/pending
  // remain real (live or upcoming) subscriptions.
  const subscription = current && current.status !== "cancelled" ? current : null;
  const liveStatuses = new Set(["pending", "active", "waitlisted", "paused"]);
  const earlierOrders = data.orders.filter((o) => {
    if (subscription && o.publicId === subscription.publicId) return false;
    return !liveStatuses.has(o.status);
  });

  const cards = [
    {
      label: "Total spent",
      value: fmt(Number(data.totalSpent)),
      hint: "lifetime, net of refunds",
      icon: DollarSignIcon,
    },
    {
      label: "Subscription",
      value: subscription ? ORDER_STATUS_LABEL[subscription.status] ?? subscription.status : "None",
      hint: subscription ? subscription.planName : "no active plan",
      icon: SparklesIcon,
    },
    {
      label: "Orders",
      value: String(data.ordersCount),
      hint: data.activeCount > 0 ? `${data.activeCount} active` : "all time",
      icon: PackageIcon,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboardIcon}
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        subtitle="Your subscription, spend, and order history at a glance."
      />

      <StatGrid cols={3} items={cards} />

      <SectionCard
        title="Current subscription"
        subtitle={subscription ? `Dates shown in delivery time (${zoneAbbrev(tz)}).` : undefined}
        action={subscription ? <OrderStatusBadge status={subscription.status} /> : undefined}
      >
        {subscription ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-base font-semibold">{subscription.planName}</div>
              <div className="text-muted-foreground text-sm">
                {subscription.mealSizeName} · {subscription.durationWeeks} week{subscription.durationWeeks === 1 ? "" : "s"}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <DetailField label="Per tiffin" value={fmt(Number(subscription.perTiffinPrice))} />
              <DetailField label="Plan total" value={fmt(Number(subscription.total))} />
              <DetailField label="Starts" value={formatDeliveryDate(subscription.startDate, tz)} />
              <DetailField label="Reference" value={subscription.deploymentId} mono />
            </dl>
            <Link
              href="/dashboard/meals"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              View this week&apos;s meals
            </Link>
          </div>
        ) : (
          <EmptyState
            icon={UtensilsCrossedIcon}
            message="You don't have a subscription yet. Build a plan to start getting fresh tiffins delivered."
            action={
              <Link
                href="/subscribe"
                className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm font-medium"
              >
                Subscribe now
              </Link>
            }
          />
        )}
      </SectionCard>

      {earlierOrders.length > 0 ? (
        <SectionCard
          title="Earlier plans"
          subtitle={`Plans that have ended. Dates in delivery time (${zoneAbbrev(tz)}).`}
          bleed
        >
          <div className="space-y-2">
            {earlierOrders.map((o) => (
              <ListRow
                key={o.publicId}
                title={`${o.planName} · ${o.mealSizeName}`}
                meta={`${o.durationWeeks} week${o.durationWeeks === 1 ? "" : "s"} · ${formatEpoch(o.createdAt, { timeZone: tz, mode: "date", locale: "en-CA" })} · ${o.deploymentId}`}
                trailing={
                  <>
                    <span className="nums text-sm font-medium">{fmt(Number(o.total))}</span>
                    <OrderStatusBadge status={o.status} />
                    <Link
                      href={`/me/support/new?orderId=${o.publicId}`}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                    >
                      <LifeBuoyIcon className="size-3.5" aria-hidden />
                      Report an issue
                    </Link>
                  </>
                }
              />
            ))}
          </div>
        </SectionCard>
      ) : null}

      <QuickLinks />
    </PageShell>
  );
}
