import { Suspense } from "react";
import { CheckCircleIcon, CircleSlashIcon, LayersIcon } from "lucide-react";
import { SectionCard, SkeletonStatCards, StatCard, StatGrid } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates } from "@/lib/services/notification-template.service";
import { parseSort, type SortState } from "@/lib/list/sort";
import {
  TemplateList,
  type TemplateSortColumn,
  type TemplateStatus,
} from "@/components/notifications/template-list";
import { TemplateListSkeleton } from "./template-list-skeleton";

type SearchParams = Promise<{ sort?: string; dir?: string }>;

const CHANNEL_ORDER = ["email", "in_app", "sms", "whatsapp"];

// `signup` is reserved and emits nothing yet, so it would always read as an
// unconfigured event and inflate the "not configured" count.
const HIDDEN_EVENTS = new Set(["signup"]);

async function loadTemplateItems(): Promise<{ items: TemplateStatus[]; configured: number }> {
  await requireAdmin();
  const all = await listTemplates();

  // event → channel → set of locales (enabled templates only), plus latest update.
  const agg = new Map<string, { channels: Map<string, Set<string>>; updated: number }>();
  for (const t of all) {
    if (!t.enabled) continue;
    const e = agg.get(t.event) ?? { channels: new Map<string, Set<string>>(), updated: 0 };
    const set = e.channels.get(t.channel) ?? new Set<string>();
    set.add(t.locale);
    e.channels.set(t.channel, set);
    e.updated = Math.max(e.updated, t.updatedAt ?? 0);
    agg.set(t.event, e);
  }

  const items: TemplateStatus[] = appEvent.enumValues
    .filter((ev) => !HIDDEN_EVENTS.has(ev))
    .map((event) => {
      const e = agg.get(event);
      const channels = e
        ? [...e.channels.entries()]
            .map(([channel, locales]) => ({ channel, locales: [...locales].sort() }))
            .sort((a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel))
        : [];
      return { event, channels, updatedAt: e?.updated || null };
    });

  const configured = items.filter((i) => i.channels.length > 0).length;
  return { items, configured };
}

export default function NotificationTemplatesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={3} className="grid-cols-2 sm:grid-cols-3" />}>
        <TemplateStatsData />
      </Suspense>

      <SectionCard
        title="Templates"
        subtitle="A channel with no template does not send. Select an event to edit."
      >
        <Suspense fallback={<TemplateListSkeleton />}>
          <TemplateListData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function TemplateStatsData() {
  const { items, configured } = await loadTemplateItems();
  return (
    <StatGrid cols={3}>
      <StatCard icon={LayersIcon} label="Events" value={items.length} hint="notification-producing events" />
      <StatCard icon={CheckCircleIcon} label="Configured" value={configured} hint="at least one channel" />
      <StatCard
        icon={CircleSlashIcon}
        label="Not configured"
        value={items.length - configured}
        hint="no template — won't send"
      />
    </StatGrid>
  );
}

async function TemplateListData({ searchParams }: { searchParams: SearchParams }) {
  const sort: SortState<TemplateSortColumn> = parseSort(
    await searchParams,
    ["event", "channels", "updated"],
    { column: "event", dir: "asc" },
  );

  const { items } = await loadTemplateItems();

  // Data is aggregated in-memory from the event enum (no Drizzle query to
  // orderBy), so the sort is applied to the array here, server-side, before the
  // client list renders it.
  const dir = sort.dir === "asc" ? 1 : -1;
  const sorted = [...items].sort((a, b) => {
    const d =
      sort.column === "event"
        ? a.event.localeCompare(b.event)
        : sort.column === "channels"
          ? a.channels.length - b.channels.length
          : (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
    return d * dir;
  });

  return <TemplateList items={sorted} sort={sort} />;
}
