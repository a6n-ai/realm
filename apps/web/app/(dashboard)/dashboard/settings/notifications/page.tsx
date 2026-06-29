import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates } from "@/lib/services/notification-template.service";
import { TemplateList, type TemplateStatus } from "@/components/notifications/template-list";

export default async function NotificationTemplatesPage() {
  await requireAdmin();
  const all = await listTemplates();
  const enabled = new Set(all.filter((t) => t.enabled).map((t) => `${t.event}:${t.channel}`));

  const items: TemplateStatus[] = appEvent.enumValues
    .filter((e) => e !== "manual_adjustment")
    .map((event) => ({
      event,
      email: enabled.has(`${event}:email`),
      inApp: enabled.has(`${event}:in_app`),
    }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-balance">Notification templates</h1>
        <p className="text-muted-foreground">A channel with no template does not send. Select an event to edit.</p>
      </div>
      <TemplateList items={items} />
    </div>
  );
}
