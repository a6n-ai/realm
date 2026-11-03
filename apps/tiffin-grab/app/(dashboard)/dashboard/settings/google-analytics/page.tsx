import { ChartLineIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader, SectionCard } from "@/components/ds";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { getGaStatus } from "@/lib/services/google-analytics/config";
import { GaForm, SendGaTestEvent } from "./ga-form";

const EVENTS = [
  { name: "page_view", where: "Every public and customer page, including in-app navigation. Browser." },
  { name: "begin_checkout", where: "Checkout opens. Browser." },
  { name: "generate_lead", where: "Contact form or waitlist sign-up. Server." },
  { name: "sign_up", where: "New account from the sign-up page. Server." },
  { name: "purchase", where: "Payment confirmed, with amount and order ID. Server." },
];

export default async function GoogleAnalyticsSettingsPage() {
  await requireAdmin();
  const s = await getGaStatus();

  const connection = !s.measurementId ? (
    <Badge variant="warning-light">Not set up</Badge>
  ) : s.secretReadable ? (
    <Badge variant="success-light">Browser + server</Badge>
  ) : (
    <Badge variant="info-light">Browser only</Badge>
  );

  return (
    <div className="grid gap-6">
      <PageHeader icon={ChartLineIcon} title="Google Analytics" subtitle="Visitors, traffic sources, and conversions in GA4." />

      {!s.hasEncryptionKey ? (
        <Alert variant="warning">
          <AlertTitle>Encryption key missing</AlertTitle>
          <AlertDescription>
            Set INTEGRATIONS_ENCRYPTION_KEY on the server to store the API secret. Page tracking works without it.
          </AlertDescription>
        </Alert>
      ) : s.hasSecret && !s.secretReadable ? (
        <Alert variant="destructive">
          <AlertTitle>Saved secret cannot be read</AlertTitle>
          <AlertDescription>The encryption key changed since it was saved. Paste the secret again.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Connection" subtitle="Changes reach the site within 5 minutes. No redeploy." action={connection}>
          <GaForm measurementId={s.measurementId ?? s.envMeasurementId ?? ""} hasSecret={s.hasSecret} />
        </SectionCard>

        <SectionCard title="Check the connection" subtitle="Validates a sample event with Google, then sends it to DebugView only.">
          {!s.secretReadable ? (
            <p className="text-muted-foreground text-sm">Save a measurement ID and API secret to send a test event.</p>
          ) : null}
          <SendGaTestEvent ready={s.secretReadable && Boolean(s.measurementId)} />
        </SectionCard>
      </div>

      <SectionCard title="What gets tracked" subtitle="Staff pages are never tracked.">
        <ul className="divide-border flex flex-col divide-y">
          {EVENTS.map((e) => (
            <li key={e.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm font-medium sm:w-48">{e.name}</span>
              <span className="text-muted-foreground text-sm">{e.where}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
