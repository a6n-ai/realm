import { MegaphoneIcon } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ds";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { getMetaPixelStatus } from "@/lib/services/meta-pixel/config";
import { MetaPixelForm, SendTestEvent } from "./meta-pixel-form";

const EVENTS = [
  { name: "PageView", where: "Every public and customer page. Browser and server share one event_id." },
  { name: "ViewContent", where: "Menu, weekly menu, and plans. Browser and server." },
  { name: "FindLocation", where: "Delivery area tap on the map. Browser and server share one event_id." },
  { name: "AddToCart", where: "Plan chosen in the subscribe wizard. Browser and server." },
  { name: "InitiateCheckout", where: "Checkout opens with the priced total. Browser and server." },
  { name: "AddPaymentInfo", where: "Customer picks Stripe or e-Transfer. Browser and server, with the full priced total." },
  { name: "Lead", where: "Contact form or waitlist sign-up (website). Browser and server, counted once." },
  { name: "Lead (CRM)", where: "Instant Forms ingest or when a Meta lead id is first attached. Server-only, action_source system_generated." },
  { name: "CRM stage events", where: "Inquiry status changes when a Meta lead id is present (e.g. Responded, Expected)." },
  { name: "QualifiedLead", where: "Inquiry convert (took plan/trial) with a Meta lead id. Optimize Instant Forms campaigns to this event." },
  { name: "Contact", where: "WhatsApp chat. Browser and server." },
  { name: "CompleteRegistration", where: "New account from the sign-up page. Server." },
  { name: "order_submitted", where: "Offline (e-Transfer/cash): when proof or a reference is submitted. Browser and server share one id. Not a Purchase." },
  { name: "Purchase", where: "Card: when the charge settles (full amount incl. tax/surcharge). Offline: when staff verifies payment. Browser and server share one id (card); offline Purchase is server-only. Idempotent via metaPurchaseSentAt." },
];

export default async function MetaPixelSettingsPage() {
  const s = await getMetaPixelStatus();

  const connection = !s.pixelId ? (
    <Badge variant="warning-light">Not set up</Badge>
  ) : s.tokenReadable ? (
    <Badge variant="success-light">Browser + server</Badge>
  ) : (
    <Badge variant="info-light">Browser only</Badge>
  );

  const leadgenReady = s.leadgenVerifyTokenSet && s.pageAccessTokenReadable;

  return (
    <div className="grid gap-6">
      <PageHeader icon={MegaphoneIcon} title="Meta Pixel" subtitle="Track visits and conversions for Facebook and Instagram ads." />

      {!s.hasEncryptionKey ? (
        <Alert variant="warning">
          <AlertTitle>Encryption key missing</AlertTitle>
          <AlertDescription>
            Set INTEGRATIONS_ENCRYPTION_KEY on the server to store the access token. The browser pixel works without it.
          </AlertDescription>
        </Alert>
      ) : s.hasToken && !s.tokenReadable ? (
        <Alert variant="destructive">
          <AlertTitle>Saved token cannot be read</AlertTitle>
          <AlertDescription>The encryption key changed since it was sealed. Paste the token again.</AlertDescription>
        </Alert>
      ) : null}

      {s.testEventCode ? (
        <Alert variant="warning">
          <AlertTitle>Test mode is on</AlertTitle>
          <AlertDescription>
            Server events go to Events Manager → Test events, not live. Clear the test event code when you are done.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Connection" subtitle="Changes reach the site within 5 minutes. No redeploy." action={connection}>
          <MetaPixelForm
            pixelId={s.pixelId ?? ""}
            hasToken={s.hasToken}
            testEventCode={s.testEventCode ?? ""}
            leadgenVerifyTokenSet={s.leadgenVerifyTokenSet}
            hasPageAccessToken={s.hasPageAccessToken}
            hasAppSecret={s.hasAppSecret}
          />
        </SectionCard>

        <SectionCard title="Check the connection" subtitle="Sends server events with your test event code.">
          {!s.tokenReadable || !s.testEventCode ? (
            <p className="text-muted-foreground text-sm">Save an access token and a test event code to send a test event.</p>
          ) : null}
          <SendTestEvent ready={s.tokenReadable && Boolean(s.testEventCode)} />
          <div className="mt-4 border-t pt-4">
            <p className="text-muted-foreground mb-2 text-sm">
              Lead Ads ingest:{" "}
              {leadgenReady ? (
                <Badge variant="success-light">Ready</Badge>
              ) : (
                <Badge variant="warning-light">Needs verify token + page token</Badge>
              )}
            </p>
            <p className="text-muted-foreground text-sm text-pretty">
              After CRM QualifiedLead events appear in Test events, open Ads Manager → Instant Forms campaign → Connect CRM →
              choose Maximize number of qualified leads and map it to QualifiedLead.
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="What gets tracked" subtitle="Staff pages are never tracked. Server events send hashed email and phone so Meta can match them.">
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
