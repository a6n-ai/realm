import { ChartLineIcon } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ds";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { getGaStatus } from "@/lib/services/google-analytics/config";
import { GaForm, SendGaTestEvent } from "./ga-form";

const EVENTS = [
  { name: "page_view", where: "Every public and customer page, including in-app navigation. Browser." },
  { name: "add_to_cart", where: "Plan chosen in the subscribe wizard. Browser. Value and currency when priced." },
  { name: "begin_checkout", where: "Checkout opens with the priced total. Browser." },
  { name: "add_payment_info", where: "Customer picks Stripe or e-Transfer. Browser, with payment_type and the priced total." },
  { name: "generate_lead", where: "Contact form or waitlist sign-up. Server." },
  { name: "sign_up", where: "New account from the sign-up page. Server." },
  {
    name: "purchase",
    where:
      "Card: when the charge settles. Offline: when proof or a reference is submitted. Browser and server share transaction_id (payment id); payment_type is stripe or etransfer — not separate events.",
  },
];

export default async function GoogleAnalyticsSettingsPage() {
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

      {s.measurementId && !s.secretReadable ? (
        <Alert variant="warning">
          <AlertTitle>Browser only</AlertTitle>
          <AlertDescription>
            Save an API secret so the badge reads Browser + server. Without it, server <code className="text-xs">purchase</code>{" "}
            events (Measurement Protocol) never reach GA4 — use DebugView after the test send below.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Connection" subtitle="Changes reach the site within 5 minutes. No redeploy." action={connection}>
          <GaForm measurementId={s.measurementId ?? s.envMeasurementId ?? ""} hasSecret={s.hasSecret} />
        </SectionCard>

        <SectionCard title="Check the connection" subtitle="Validates a sample event with Google, then sends it to DebugView only.">
          {!s.secretReadable ? (
            <p className="text-muted-foreground text-sm">Save a measurement ID and API secret to send a test event.</p>
          ) : (
            <p className="text-muted-foreground mb-3 text-sm">
              After a successful send, open GA4 Admin → DebugView to confirm the hit. Live Reports can lag.
            </p>
          )}
          <SendGaTestEvent ready={s.secretReadable && Boolean(s.measurementId)} />
        </SectionCard>
      </div>

      <SectionCard
        title="What gets tracked"
        subtitle="Staff pages are never tracked. In GA4 Admin → Events, star Key events once they appear: purchase first, then begin_checkout, add_to_cart, add_payment_info, generate_lead, and sign_up if you optimize ads on those. Do not use Create event to invent purchase from begin_checkout."
      >
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
