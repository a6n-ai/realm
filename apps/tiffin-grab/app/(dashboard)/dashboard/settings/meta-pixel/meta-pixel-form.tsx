"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@foundry/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@foundry/ui/input";
import { removeMetaPixelToken, saveMetaPixelSettings, sendMetaPixelTestEvent } from "./actions";

export function MetaPixelForm({
  pixelId,
  hasToken,
  testEventCode,
}: {
  pixelId: string;
  hasToken: boolean;
  testEventCode: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState({ pixelId, accessToken: "", testEventCode });
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
      setValues((v) => ({ ...v, accessToken: "" }));
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

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !values.pixelId.trim()}>
          {pending ? "Saving..." : "Save"}
        </Button>
        {hasToken ? (
          <Button type="button" variant="outline" disabled={pending} onClick={removeToken}>
            Remove token
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
        {pending ? "Sending..." : "Send test event"}
      </Button>
      {result?.error ? (
        <Alert variant="destructive">
          <AlertTitle>Meta did not accept the event</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : result ? (
        <Alert variant="success">
          <AlertTitle>Meta received {result.eventsReceived} event</AlertTitle>
          <AlertDescription>Open Events Manager → Test events. A PageView from the server should show within a minute.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
