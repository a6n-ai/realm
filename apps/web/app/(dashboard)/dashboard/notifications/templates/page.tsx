import { Suspense } from "react";
import { LayersIcon, CheckCircleIcon, CircleSlashIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates } from "@/lib/services/notification-template.service";
import { SectionCard, StatCard, SkeletonStatCards } from "@/components/ds";
import { TemplateList, type TemplateStatus } from "@/components/notifications/template-list";
import { TemplateListSkeleton } from "./template-list-skeleton";

const CHANNEL_ORDER = ["email", "in_app", "sms", "whatsapp"];

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
    .filter((ev) => ev !== "manual_adjustment")
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

export default function NotificationTemplatesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={3} className="sm:grid-cols-3" />}>
        <TemplateStatsData />
      </Suspense>

      <SectionCard title="Templates" subtitle="A channel with no template does not send. Select an event to edit.">
        <Suspense fallback={<TemplateListSkeleton />}>
          <TemplateListData />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function TemplateStatsData() {
  const { items, configured } = await loadTemplateItems();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard icon={LayersIcon} label="Events" value={items.length} hint="notification-producing events" />
      <StatCard icon={CheckCircleIcon} label="Configured" value={configured} hint="at least one channel" />
      <StatCard icon={CircleSlashIcon} label="Not configured" value={items.length - configured} hint="no template — won't send" />
    </div>
  );
}

async function TemplateListData() {
  const { items } = await loadTemplateItems();
  return <TemplateList items={items} />;
}
