import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates } from "@/lib/services/notification-template.service";
import { TemplateRow } from "@/components/notifications/template-status";

export default async function NotificationTemplatesPage() {
  await requireAdmin();
  const all = await listTemplates();
  const has = (event: string, channel: string) =>
    all.some((t) => t.event === event && t.channel === channel && t.enabled);
  const events = appEvent.enumValues.filter((e) => e !== "manual_adjustment");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notification templates</h1>
        <p className="text-muted-foreground">A channel with no template does not send. Click an event to edit.</p>
      </div>
      <div className="grid gap-2">
        {events.map((event) => (
          <TemplateRow key={event} event={event} email={has(event, "email")} inApp={has(event, "in_app")} />
        ))}
      </div>
    </div>
  );
}
