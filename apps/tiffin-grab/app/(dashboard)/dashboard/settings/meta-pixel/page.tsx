import { MegaphoneIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader, SectionCard } from "@/components/ds";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { getMetaPixelStatus } from "@/lib/services/meta-pixel/config";
import { MetaPixelForm, SendTestEvent } from "./meta-pixel-form";

const EVENTS = [
  { name: "PageView", where: "Every public and customer page. Browser." },
  { name: "InitiateCheckout", where: "Checkout opens. Browser." },
  { name: "Lead", where: "Contact form or waitlist sign-up. Server." },
  { name: "CompleteRegistration", where: "New account from the sign-up page. Server." },
  { name: "Purchase", where: "Payment confirmed (card settles or staff verifies), with the amount paid. Server." },
];

export default async function MetaPixelSettingsPage() {
  await requireAdmin();
  const s = await getMetaPixelStatus();

  const connection = !s.pixelId ? (
    <Badge variant="warning-light">Not set up</Badge>
  ) : s.tokenReadable ? (
    <Badge variant="success-light">Browser + server</Badge>
  ) : (
    <Badge variant="info-light">Browser only</Badge>
  );

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
          <AlertDescription>The encryption key changed since it was saved. Paste the token again.</AlertDescription>
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
          <MetaPixelForm pixelId={s.pixelId ?? ""} hasToken={s.hasToken} testEventCode={s.testEventCode ?? ""} />
        </SectionCard>

        <SectionCard title="Check the connection" subtitle="Sends one server PageView with your test event code.">
          {!s.tokenReadable || !s.testEventCode ? (
            <p className="text-muted-foreground text-sm">Save an access token and a test event code to send a test event.</p>
          ) : null}
          <SendTestEvent ready={s.tokenReadable && Boolean(s.testEventCode)} />
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
