import { LayersIcon, MailIcon, SmartphoneIcon, CircleSlashIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates } from "@/lib/services/notification-template.service";
import { SectionCard, StatCard } from "@/components/ds";
import { TemplateList, type TemplateStatus } from "@/components/notifications/template-list";

export default async function NotificationTemplatesPage() {
  await requireAdmin();
  const all = await listTemplates();

  const agg = new Map<string, { email: Set<string>; inApp: Set<string>; updated: number }>();
  for (const t of all) {
    if (!t.enabled) continue;
    const e = agg.get(t.event) ?? { email: new Set<string>(), inApp: new Set<string>(), updated: 0 };
    (t.channel === "email" ? e.email : e.inApp).add(t.locale);
    e.updated = Math.max(e.updated, t.updatedAt ?? 0);
    agg.set(t.event, e);
  }

  const items: TemplateStatus[] = appEvent.enumValues
    .filter((ev) => ev !== "manual_adjustment")
    .map((event) => {
      const e = agg.get(event);
      return {
        event,
        emailLocales: e ? [...e.email].sort() : [],
        inAppLocales: e ? [...e.inApp].sort() : [],
        updatedAt: e?.updated || null,
      };
    });

  const withEmail = items.filter((i) => i.emailLocales.length > 0).length;
  const withInApp = items.filter((i) => i.inAppLocales.length > 0).length;
  const missing = items.filter((i) => i.emailLocales.length === 0 && i.inAppLocales.length === 0).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={LayersIcon} label="Events" value={items.length} hint="notification-producing events" />
        <StatCard icon={MailIcon} label="Email configured" value={withEmail} />
        <StatCard icon={SmartphoneIcon} label="In-app configured" value={withInApp} />
        <StatCard icon={CircleSlashIcon} label="Not configured" value={missing} hint="no template — won't send" />
      </div>

      <SectionCard title="Templates" subtitle="A channel with no template does not send. Select an event to edit.">
        <TemplateList items={items} />
      </SectionCard>
    </div>
  );
}
