"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Card } from "@foundry/ui/card";
import { Separator } from "@foundry/ui/separator";
import { Switch } from "@foundry/ui/switch";
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";

export interface EmailTypeRow {
  event: string;
  label: string;
  category: string;
  categoryLabel: string;
  tracked: boolean;
  locked: boolean;
}

export const LOCKED_COPY = "Login and security emails stay untracked so they don't land in spam.";

const groupByCategory = (rows: EmailTypeRow[]) => {
  const groups = new Map<string, EmailTypeRow[]>();
  for (const t of rows) groups.set(t.categoryLabel, [...(groups.get(t.categoryLabel) ?? []), t]);
  return groups;
};

/** Save bar shared by both tabs: status on the left, Reset + Save on the right. */
export function SaveBar({
  status,
  dirty,
  pending,
  error,
  onReset,
  onSave,
}: {
  status: string;
  dirty: boolean;
  pending: boolean;
  error?: string;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{status}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        {dirty && (
          <Button variant="ghost" disabled={pending} onClick={onReset}>
            Reset
          </Button>
        )}
        <Button onClick={onSave} disabled={pending || !dirty} className="gap-2">
          <SaveIcon className="size-4" />
          Save
        </Button>
      </div>
    </div>
  );
}

export function TrackedEmailsForm({
  types,
  onSave,
}: {
  types: EmailTypeRow[];
  onSave: (events: string[]) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => types.filter((t) => t.tracked).map((t) => t.event));
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const dirty = draft.length !== saved.length || draft.some((e) => !saved.includes(e));
  const trackable = types.filter((t) => !t.locked).length;

  const save = () =>
    start(async () => {
      const res = await onSave(draft);
      setError(res.error);
      if (!res.error) {
        setSaved(draft);
        toast.success("Tracked emails saved");
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-6">
      <SaveBar
        status={`${draft.length} of ${trackable} emails tracked${dirty ? " · unsaved changes" : ""}`}
        dirty={dirty}
        pending={pending}
        error={error}
        onReset={() => setDraft(saved)}
        onSave={save}
      />
      <div className="grid items-start gap-6 md:grid-cols-2">
        {[...groupByCategory(types)].map(([group, rows]) => {
          const on = rows.filter((r) => draft.includes(r.event)).length;
          return (
            <section key={group} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{group}</h3>
                {!rows[0]?.locked && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {on} of {rows.length} tracked
                  </span>
                )}
              </div>
              {rows[0]?.locked && <p className="text-xs text-muted-foreground">{LOCKED_COPY}</p>}
              <Card className="p-0">
                <FieldGroup className="gap-0">
                  {rows.map((r, i) => (
                    <Fragment key={r.event}>
                      {i > 0 && <Separator />}
                      <Field data-disabled={r.locked || undefined}>
                        <FieldLabel className="justify-between px-4 py-3">
                          <FieldTitle>{r.label}</FieldTitle>
                          <Switch
                            checked={draft.includes(r.event)}
                            disabled={r.locked || pending}
                            onCheckedChange={(v) => setDraft((d) => (v ? [...d, r.event] : d.filter((e) => e !== r.event)))}
                          />
                        </FieldLabel>
                      </Field>
                    </Fragment>
                  ))}
                </FieldGroup>
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function LoadErrorAlert({ message }: { message: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => start(() => router.refresh())}>
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}
