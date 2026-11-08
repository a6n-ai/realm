"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Switch } from "@foundry/ui/switch";
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
  const unchanged = draft.length === saved.length && draft.every((e) => saved.includes(e));

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
      {[...groupByCategory(types)].map(([group, rows]) => (
        <div key={group} className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">{group}</p>
          {rows[0]?.locked && <p className="text-xs text-muted-foreground">{LOCKED_COPY}</p>}
          {rows.map((r) => (
            <label key={r.event} className="flex items-center justify-between gap-4">
              <span className="text-sm">{r.label}</span>
              <Switch
                checked={draft.includes(r.event)}
                disabled={r.locked || pending}
                onCheckedChange={(on) => setDraft((d) => (on ? [...d, r.event] : d.filter((e) => e !== r.event)))}
              />
            </label>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending || unchanged} className="gap-2">
          <SaveIcon className="size-4" />
          Save
        </Button>
        {!unchanged && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDraft(saved)}>
            Reset
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
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
