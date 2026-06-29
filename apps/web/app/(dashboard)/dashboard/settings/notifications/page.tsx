import { requireAdmin } from "@/lib/auth/guards";
import { listTemplates } from "@/lib/services/notification-template.service";
import { EVENT_ENTITY, availableVariables, type AppEvent } from "@/lib/notifications/event-entities";
import { TemplateEditor } from "@/components/notifications/template-editor";

export default async function NotificationTemplatesPage() {
  await requireAdmin();
  const all = await listTemplates();
  const events = Object.keys(EVENT_ENTITY) as AppEvent[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Notification templates</h1>
        <p className="text-muted-foreground">
          Edit email + in-app templates per event and locale. A channel with no template does not send.
        </p>
      </div>
      {events.map((event) => (
        <section key={event} className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">{event}</h2>
          <TemplateEditor
            event={event}
            variables={availableVariables(event)}
            initial={all
              .filter((t) => t.event === event)
              .map((t) => ({
                channel: t.channel as "email" | "in_app",
                locale: t.locale as "en" | "fr",
                subject: t.subject,
                body: t.body,
                enabled: t.enabled,
              }))}
          />
        </section>
      ))}
    </div>
  );
}
