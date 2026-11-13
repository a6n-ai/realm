"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@foundry/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@foundry/ui/input";
import {
  removeMetaLeadgenSecrets,
  removeMetaPixelToken,
  saveMetaPixelSettings,
  sendMetaCrmTestEvent,
  sendMetaPixelTestEvent,
} from "./actions";

export function MetaPixelForm({
  pixelId,
  hasToken,
  testEventCode,
  leadgenVerifyTokenSet,
  hasPageAccessToken,
  hasAppSecret,
}: {
  pixelId: string;
  hasToken: boolean;
  testEventCode: string;
  leadgenVerifyTokenSet: boolean;
  hasPageAccessToken: boolean;
  hasAppSecret: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    pixelId,
    accessToken: "",
    testEventCode,
    leadgenVerifyToken: "",
    pageAccessToken: "",
    appSecret: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const save = () =>
    start(async () => {
      const res = await saveMetaPixelSettings(values);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setError(null);
      setValues((v) => ({
        ...v,
        accessToken: "",
        leadgenVerifyToken: "",
        pageAccessToken: "",
        appSecret: "",
      }));
      toast.success("Meta Pixel saved");
      router.refresh();
    });

  const removeToken = () =>
    start(async () => {
      const res = await removeMetaPixelToken();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Token removed. Server events are off.");
      router.refresh();
    });

  const clearLeadgen = () =>
    start(async () => {
      const res = await removeMetaLeadgenSecrets();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Lead Ads ingest settings cleared.");
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field>
        <FieldLabel htmlFor="pixel-id">Pixel ID</FieldLabel>
        <Input id="pixel-id" inputMode="numeric" value={values.pixelId} onChange={set("pixelId")} placeholder="123456789012345" />
        <FieldDescription>Events Manager → Data sources → your pixel. The number under its name.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="access-token">Conversions API access token</FieldLabel>
        <Input
          id="access-token"
          type="password"
          autoComplete="off"
          value={values.accessToken}
          onChange={set("accessToken")}
          placeholder={hasToken ? "Saved. Paste a new one to replace it." : "EAAB..."}
        />
        <FieldDescription>
          Pixel → Settings → Conversions API → Generate access token. Stored encrypted and never shown again.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="test-code">Test event code</FieldLabel>
        <Input id="test-code" value={values.testEventCode} onChange={set("testEventCode")} placeholder="TEST12345" />
        <FieldDescription>
          From Events Manager → Test events. While set, every server event goes to Test events instead of live, so clear it once
          testing is done.
        </FieldDescription>
      </Field>

      <div className="border-t pt-4">
        <p className="mb-3 text-sm font-medium">Instant Forms → CRM (Qualified Leads)</p>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="leadgen-verify">Leadgen verify token</FieldLabel>
            <Input
              id="leadgen-verify"
              type="password"
              autoComplete="off"
              value={values.leadgenVerifyToken}
              onChange={set("leadgenVerifyToken")}
              placeholder={leadgenVerifyTokenSet ? "Saved. Paste a new one to replace it." : "Same value as Meta App → Webhooks"}
            />
            <FieldDescription>
              Callback URL: <code className="text-xs">/api/webhooks/meta/leadgen</code>. Subscribe the Page to{" "}
              <code className="text-xs">leadgen</code>.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="page-token">Page access token</FieldLabel>
            <Input
              id="page-token"
              type="password"
              autoComplete="off"
              value={values.pageAccessToken}
              onChange={set("pageAccessToken")}
              placeholder={hasPageAccessToken ? "Saved. Paste a new one to replace it." : "Needs leads_retrieval"}
            />
            <FieldDescription>Used to fetch Instant Form field data for each lead id.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="app-secret">App secret</FieldLabel>
            <Input
              id="app-secret"
              type="password"
              autoComplete="off"
              value={values.appSecret}
              onChange={set("appSecret")}
              placeholder={hasAppSecret ? "Saved. Paste a new one to replace it." : "Optional but recommended"}
            />
            <FieldDescription>Verifies <code className="text-xs">X-Hub-Signature-256</code> on webhook POSTs.</FieldDescription>
          </Field>
        </div>
      </div>

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !values.pixelId.trim()}>
          {pending ? "Saving..." : "Save"}
        </Button>
        {hasToken ? (
          <Button type="button" variant="outline" disabled={pending} onClick={removeToken}>
            Remove CAPI token
          </Button>
        ) : null}
        {leadgenVerifyTokenSet || hasPageAccessToken || hasAppSecret ? (
          <Button type="button" variant="outline" disabled={pending} onClick={clearLeadgen}>
            Clear Lead Ads settings
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function SendTestEvent({ ready }: { ready: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; eventsReceived?: number } | null>(null);

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={!ready || pending}
        onClick={() => start(async () => setResult(await sendMetaPixelTestEvent()))}
      >
        {pending ? "Sending..." : "Send test PageView"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!ready || pending}
        onClick={() => start(async () => setResult(await sendMetaCrmTestEvent()))}
      >
        {pending ? "Sending..." : "Send test QualifiedLead (CRM)"}
      </Button>
      {result?.error ? (
        <Alert variant="destructive">
          <AlertTitle>Meta did not accept the event</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : result ? (
        <Alert variant="success">
          <AlertTitle>Meta received {result.eventsReceived} event</AlertTitle>
          <AlertDescription>Open Events Manager → Test events. The server event should show within a minute.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
