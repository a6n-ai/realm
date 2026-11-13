import Link from "next/link";
import { zonedDateIso } from "@foundry/commons";
import { dayRange } from "@foundry/commons/util/dates";
import { Badge } from "@/components/reui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { loadOwnerOptions } from "@/lib/list/facet-options";
import { withListDates } from "@/lib/list/default-month";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";
import { RENEWAL_QUEUES, parseRenewalsFilter, renewalQueueFilter, resolveRange, type RenewalQueue, type RenewalsFilter } from "@/lib/renewals/filters";
import { requestNow } from "@/lib/dates/request-now";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { countTrackQueues, listRenewals } from "@/lib/renewals/renewals.service";
import { RenewalsQueueList } from "./renewals-queue-list";
const TABS: { value: RenewalQueue; label: string }[] = [
  { value: "renew", label: "To renew" },
  { value: "due", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "open", label: "All open" },
  { value: "closed", label: "Closed" },
];
/** Switching queues keeps the owner, range and search, and resets the page. */
function queueHref(sp: Record<string, string | undefined>, queue: RenewalQueue): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && !["page", "queue", "bucket", "highlight"].includes(k)) next.set(k, v);
  }
  next.set("view", "renewals");
  next.set("queue", queue);
  return `/dashboard/inquiries?${next.toString()}`;
}
/** The Renewals view of the follow-up queue: plans, not leads. Dates follow the top range, as the Renewals desk does. */
export async function RenewalsQueue({ sp }: { sp: Record<string, string | undefined> }) {
  await requirePermission({ order: ["read"] });
  const session = await getSession();
  const [visible, { timezone }, owners] = await Promise.all([resolveSessionVisibleOrgIds(session), getAppSettings(), loadOwnerOptions()]);
  const today = zonedDateIso(requestNow(), timezone);
  const { start: dayStart, end: dayEnd } = dayRange(today, timezone);
  const day = { dayStart, dayEnd };
  const queue = RENEWAL_QUEUES.find((q) => q === sp.queue) ?? "renew";
  const parsed = parseRenewalsFilter(await withListDates(sp));
  const f: RenewalsFilter = {
    ...parsed,
    tab: "renewals",
    type: null,
    dateBy: "last",
    ending: null,
    ended: null,
    status: null,
    renewed: null,
    owner: resolveOwnerParam(sp.owner, session?.user.id) ?? null,
    ...renewalQueueFilter(queue),
  };
  const spec: FacetDef[] = [
    { kind: "select", field: "owner", label: "Owner", options: [{ value: ME, label: "Me" }, { value: ALL_OWNERS, label: "All owners" }, ...owners] },
    { kind: "search", fields: ["fullName", "deploymentId", "phone"] },
  ];
  const { page } = parseFilterState(spec, sp);
  const range = resolveRange(f, timezone);
  const [result, counts] = await Promise.all([
    listRenewals(visible, f, today, { page: page.page, size: page.size }, range, day),
    countTrackQueues(visible, f, today, range, day),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <Tabs value={queue}>
        <TabsList variant="line" aria-label="Renewal follow-up queues">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} asChild className="gap-1.5">
              <Link href={queueHref(sp, t.value)} prefetch={false}>
                {t.label}
                <Badge variant={t.value === "overdue" && counts.overdue > 0 ? "destructive-light" : "secondary"} className="tabular-nums">
                  {counts[t.value]}
                </Badge>
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <RenewalsQueueList rows={result.items} total={result.total} page={page.page} size={page.size} queue={queue} today={today} spec={spec} />
    </div>
  );
}

/** Queue tabs, then table rows: the shape of the Renewals view while it loads. */
export function RenewalsQueueSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
