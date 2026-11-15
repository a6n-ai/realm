import { type Visible, noVisibleOrgs } from "@/lib/tenant/org-scope";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LayoutDashboardIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { assertStaffSession, can } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/settings";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { coversAllOrgs, getTodayCounts, getTodayQueue } from "@/lib/today/today.service";
import { staffFirstName } from "@/lib/overview/overview.service";
import { OVERVIEW_KINDS, isTodayKind, type TodayKind } from "@/lib/today/types";
import { formatDateOnly } from "@/lib/format/datetime";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { ChartSkeleton } from "@/components/dashboard/analytics/skeletons";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { PageShell, PageHeader, SectionCard, PageSkeleton, DataTableSkeleton } from "@/components/ds";
import { parseWeekParam } from "@/lib/deliveries/view/week";
import { GlanceCard } from "./_overview/glance-card";
import { ServiceCard } from "./_overview/service-card";
import { NeedsActionCard } from "./_overview/needs-action-card";
import { RouteCard } from "./_overview/route-card";
import { LanesCard } from "./_overview/lanes-card";
import { MenusCard } from "./_overview/menus-card";
import { KitchenWeekCard } from "./_overview/kitchen-week-card";
import { TodayQueue } from "./_overview/today-queue";
import { mondayOfIso } from "@foundry/commons/util/dates";
import { requestNow } from "@/lib/dates/request-now";

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

// Staff-only: the overview exposes business-wide stats and customer PII (the layout already sends customers to /me).
async function DashboardData({ searchParams }: { searchParams: SearchParams }) {
  await assertStaffSession();
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const visible = await resolveSessionVisibleOrgIds(session);
  // Each region needs the read permission of its own domain; a role with none sees an empty overview.
  const [seesMenus, editsMenus, seesOrders, seesDelivery, seesPayments, seesTickets] = await Promise.all([
    can({ menu: ["read"] }),
    can({ menu: ["write"] }),
    can({ order: ["read"] }),
    can({ delivery: ["read"] }),
    can({ finance: ["verify"] }),
    can({ ticket: ["read"] }),
  ]);
  const allowedKinds = OVERVIEW_KINDS.filter((k) =>
    k === "payment" ? seesPayments : k === "ticket" ? seesTickets : seesOrders,
  );
  const perms = { orders: seesOrders, delivery: seesDelivery, payments: seesPayments, tickets: seesTickets, menus: seesMenus, editMenus: editsMenus };
  const { type, week } = await searchParams;
  const activeType = isTodayKind(type) && allowedKinds.includes(type) ? type : null;
  const { timezone } = await getAppSettings();
  const now = requestNow();
  const today = zonedDateIso(now, timezone);
  // "Hi Vishwas" and "Saturday, October 31", both from the app timezone's today.
  const firstName = await staffFirstName(session.user.email);
  const greeting = firstName ? `Hi ${firstName}` : "Overview";
  const todayLabel = formatDateOnly(today, { mode: "fullDate" });

  const seesAll = (await coversAllOrgs(visible)) && seesDelivery;
  const weekStart = parseWeekParam(week) ?? mondayOfIso(today);

  if (noVisibleOrgs(visible)) {
    return (
      <PageShell>
        <PageHeader icon={LayoutDashboardIcon} title={greeting} subtitle={`${todayLabel} · What is waiting on us today.`} />
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

  if (!seesMenus && !seesOrders && !seesDelivery && !seesPayments && !seesTickets) {
    return (
      <PageShell>
        <PageHeader icon={LayoutDashboardIcon} title={greeting} subtitle={todayLabel} />
        <Alert>
          <AlertTitle>Nothing to show yet</AlertTitle>
          <AlertDescription>Your role has no overview access. Use the menu to open the pages you can use.</AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader icon={LayoutDashboardIcon} title={greeting} subtitle={`${todayLabel} · What is waiting on us today.`} />

      {seesOrders && (
        <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
          <GlanceCard visible={visible} today={today} now={now} timeZone={timezone} />
        </Suspense>
      )}

      {/* Act first: what needs doing, how today is going, the menus to release. */}
      <CardGrid
        cards={[
          { key: "action", node: <NeedsActionCard visible={visible} today={today} seesAll={seesAll} perms={perms} />, h: 260 },
          seesAll && { key: "service", node: <ServiceCard today={today} />, h: 260 },
          seesMenus && { key: "menus", node: <MenusCard today={today} canEdit={editsMenus} />, h: 200 },
        ]}
      />

      {allowedKinds.length > 0 && (
        <div id="queue">
          <SectionCard title="Waiting on us" subtitle="Most urgent first. Verify a payment here; every other row opens its record.">
            <Suspense fallback={<DataTableSkeleton columns={QUEUE_SKELETON_COLUMNS} rows={6} serial={false} />}>
              <TodayQueueSection visible={visible} today={today} now={now} activeType={activeType} kinds={allowedKinds} />
            </Suspense>
          </SectionCard>
        </div>
      )}

      {/* Then dispatch: tomorrow's route and today's drivers. What to cook is in Kitchen week. */}
      <CardGrid
        cards={[
          seesAll && { key: "route", node: <RouteCard today={today} />, h: 260 },
          seesAll && { key: "lanes", node: <LanesCard today={today} />, h: 260 },
        ]}
      />

      {seesOrders && (
        <Suspense fallback={<ChartSkeleton height={260} />}>
          <KitchenWeekCard visible={visible} monday={weekStart} thisMonday={mondayOfIso(today)} today={today} seesAll={seesAll} />
        </Suspense>
      )}

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

async function TodayQueueSection({ visible, today, now, activeType, kinds }: { visible: Visible; today: string; now: number; activeType: TodayKind | null; kinds: readonly TodayKind[] }) {
  const [counts, queue] = await Promise.all([
    getTodayCounts(visible, today),
    getTodayQueue(visible, now, activeType ? [activeType] : kinds),
  ]);
  // Pills are quick filters: each carries the exact total; picking one filters on the server before the 50 cap.
  const pills = kinds.map((k) => ({ kind: k, count: counts.byKind[k] }));
  return <TodayQueue rows={queue.items} now={now} pills={pills} failed={queue.failed} activeType={activeType} />;
}
