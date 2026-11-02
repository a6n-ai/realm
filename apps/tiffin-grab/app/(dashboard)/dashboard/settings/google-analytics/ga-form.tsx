"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { removeGaSecret, saveGaSettings, sendGaTestEvent } from "./actions";

export function GaForm({ measurementId, hasSecret }: { measurementId: string; hasSecret: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({ measurementId, apiSecret: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const save = () =>
    start(async () => {
      const res = await saveGaSettings(values);
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setValues((v) => ({ ...v, apiSecret: "" }));
      toast.success("Google Analytics saved");
      router.refresh();
    });

  const removeSecret = () =>
    start(async () => {
      const res = await removeGaSecret();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Secret removed. Server events are off.");
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
        <FieldLabel htmlFor="ga-id">Measurement ID</FieldLabel>
        <Input id="ga-id" value={values.measurementId} onChange={set("measurementId")} placeholder="G-AB12CD34EF" />
        <FieldDescription>GA → Admin → Data streams → your web stream.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="ga-secret">Measurement Protocol API secret</FieldLabel>
        <Input
          id="ga-secret"
          type="password"
          autoComplete="off"
          value={values.apiSecret}
          onChange={set("apiSecret")}
          placeholder={hasSecret ? "Saved. Paste a new one to replace it." : "Optional"}
        />
        <FieldDescription>
          Same web stream → Measurement Protocol API secrets → Create. Needed for purchases confirmed on the server. Stored
          encrypted.
        </FieldDescription>
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !values.measurementId.trim()}>
          {pending ? "Saving..." : "Save"}
        </Button>
        {hasSecret ? (
          <Button type="button" variant="outline" disabled={pending} onClick={removeSecret}>
            Remove secret
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function SendGaTestEvent({ ready }: { ready: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; problems?: string[] } | null>(null);

  return (
    <div className="flex flex-col items-start gap-3">
      <Button type="button" variant="outline" disabled={!ready || pending} onClick={() => start(async () => setResult(await sendGaTestEvent()))}>
        {pending ? "Sending..." : "Send test event"}
      </Button>
      {result?.error ? (
        <Alert variant="destructive">
          <AlertTitle>Google did not accept the event</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : result?.problems?.length ? (
        <Alert variant="destructive">
          <AlertTitle>Google flagged the event</AlertTitle>
          <AlertDescription>{result.problems.join(" ")}</AlertDescription>
        </Alert>
      ) : result ? (
        <Alert variant="success">
          <AlertTitle>Google accepted the event</AlertTitle>
          <AlertDescription>Open GA → Admin → DebugView. A settings_test event shows within a minute.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
